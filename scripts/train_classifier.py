import os
import re
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from collections import Counter
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.ensemble import HistGradientBoostingClassifier, VotingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import ComplementNB
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
    classification_report
)

REMINDER_PATTERNS = re.compile(r'\b(reminder|friendly reminder|bids are due|bids due|due tomorrow|due today|following up|follow up|confirm if you|confirm whether|bidding status|please confirm|will you be bidding|intend to bid|bid extension)\b', re.I)
RFI_PATTERNS = re.compile(r'\b(rfi|request for information|clarification|pre-bid|pre bid|site visit|questions? and answers?|q&a|bid form|sign in sheet|wage scale|wage rate|tax exempt|prevailing wage)\b', re.I)
ADDENDUM_PATTERNS = re.compile(r'\b(addendum|addenda|bulletin|revised drawings?|revised plans?|plan revision|re-issued|reissue|drawing update|spec update|narrative)\b', re.I)
AWARD_PATTERNS = re.compile(r'\b(awarded|prime award|low bidder|won the job|contract award|congratulations|selected as|notice of award|intent to award)\b', re.I)
ITB_PATTERNS = re.compile(r'\b(invitation to bid|invite to bid|invites you to bid|request for proposal|rfp|new project for bid|itb|invites partition plus|bidding opportunity)\b', re.I)

def load_dataset():
    filepath = os.path.join(os.path.dirname(__file__), '..', 'data', 'emails_dataset.jsonl')
    records = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line.strip()))
    df = pd.DataFrame(records)
    return df

def clean_and_normalize(df):
    df = df[df['label'].notna() & (df['label'] != '')].copy()
    label_mapping = {
        'invitation_to_bid': 'ITB',
        'addendum_update': 'Addendum',
        'bid_won': 'Won',
        'bid_lost': 'Lost',
        'spam_noise': 'Spam',
        'general_inquiry': 'General',
    }
    df['label'] = df['label'].replace(label_mapping)
    return df

def extract_dense_features(df):
    """
    Extract high-precision positional and intent indicators.
    """
    features = []
    for _, row in df.iterrows():
        subj = str(row.get('clean_subject') or '')
        top_msg = str(row.get('top_message') or '')
        attachments = str(row.get('attachment_names') or '')
        body_preview = str(row.get('body_core_preview') or '')
        all_text = f"{subj} {top_msg} {attachments}"

        # Highly targeted signals
        f_reminder_top = 1.0 if REMINDER_PATTERNS.search(top_msg) else 0.0
        f_reminder_subj = 1.0 if REMINDER_PATTERNS.search(subj) else 0.0
        f_rfi = 1.0 if (RFI_PATTERNS.search(subj) or RFI_PATTERNS.search(top_msg) or RFI_PATTERNS.search(attachments)) else 0.0
        f_addendum = 1.0 if (ADDENDUM_PATTERNS.search(subj) or ADDENDUM_PATTERNS.search(attachments)) else 0.0
        f_award = 1.0 if (AWARD_PATTERNS.search(subj) or AWARD_PATTERNS.search(top_msg)) else 0.0
        f_itb = 1.0 if (ITB_PATTERNS.search(subj) or ITB_PATTERNS.search(top_msg)) else 0.0
        f_has_attachments = 1.0 if row.get('attachment_count', 0) > 0 else 0.0
        f_is_forwarded = 1.0 if row.get('is_forwarded') else 0.0

        features.append([
            f_reminder_top * 3.0,
            f_reminder_subj * 2.5,
            f_rfi * 3.0,
            f_addendum * 3.5,
            f_award * 3.0,
            f_itb * 2.0,
            f_has_attachments,
            f_is_forwarded,
            len(subj) / 100.0,
            len(top_msg) / 500.0
        ])
    return np.array(features)

def build_combined_text(df):
    """
    Construct weighted text representing the email's hierarchy.
    Subject & Top Note carry 4x the weight of old thread history.
    """
    texts = []
    for _, row in df.iterrows():
        subj = str(row.get('clean_subject') or '')
        top_msg = str(row.get('top_message') or '')
        sender = str(row.get('sender_domain') or '')
        attachments = str(row.get('attachment_names') or '')
        body = str(row.get('body_core_preview') or '')

        # Heavily prioritize the immediate top message & subject
        t = f"SUBJECT_{subj} SUBJECT_{subj} TOP_{top_msg} TOP_{top_msg} ATTACH_{attachments} DOMAIN_{sender} {body}"
        texts.append(t)
    return texts

def evaluate_classifier():
    print("=" * 65)
    print("🚀 Commercial Construction Email Classifier - High Accuracy Pipeline")
    print("=" * 65)

    df = load_dataset()
    df = clean_and_normalize(df)

    label_counts = Counter(df['label'])
    print(f"Total labeled records: {len(df)}")

    # Handle rare classes with < 2 members
    rare_classes = {cls for cls, count in label_counts.items() if count < 2}
    if rare_classes:
        rare_df = df[df['label'].isin(rare_classes)]
        common_df = df[~df['label'].isin(rare_classes)]

        train_common, test_df = train_test_split(
            common_df,
            test_size=0.20,
            random_state=42,
            stratify=common_df['label']
        )
        train_df = pd.concat([train_common, rare_df], ignore_index=True)
    else:
        train_df, test_df = train_test_split(
            df,
            test_size=0.20,
            random_state=42,
            stratify=df['label']
        )

    print(f"Split: 80% Train ({len(train_df)} samples) / 20% Test ({len(test_df)} samples)")

    train_texts = build_combined_text(train_df)
    test_texts = build_combined_text(test_df)

    y_train = train_df['label'].values
    y_test = test_df['label'].values

    # TF-IDF Vectorization
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 3),
        sublinear_tf=True,
        min_df=2,
        max_df=0.85,
        strip_accents='unicode',
        token_pattern=r'(?u)\b[a-zA-Z0-9_\-\.\#]{2,}\b'
    )

    X_train_text_vec = vectorizer.fit_transform(train_texts)
    X_test_text_vec = vectorizer.transform(test_texts)

    # Dense structural & domain features
    train_dense = extract_dense_features(train_df)
    test_dense = extract_dense_features(test_df)

    from scipy.sparse import hstack
    X_train_combined = hstack([X_train_text_vec, train_dense]).tocsr()
    X_test_combined = hstack([X_test_text_vec, test_dense]).tocsr()

    print(f"Total Combined Features: {X_train_combined.shape[1]}")

    # Train classifiers
    clf_lr = LogisticRegression(C=5.0, class_weight='balanced', max_iter=3000, random_state=42)
    clf_nb = ComplementNB(alpha=0.3)

    clf_lr.fit(X_train_combined, y_train)
    clf_nb.fit(X_train_combined, y_train)

    ensemble = VotingClassifier(
        estimators=[('lr', clf_lr), ('nb', clf_nb)],
        voting='soft',
        weights=[2.0, 1.0]
    )
    ensemble.fit(X_train_combined, y_train)

    y_pred = ensemble.predict(X_test_combined)
    y_proba = ensemble.predict_proba(X_test_combined)

    acc = accuracy_score(y_test, y_pred)
    precision_macro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
        y_test, y_pred, average='macro', zero_division=0
    )
    precision_weighted, recall_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_test, y_pred, average='weighted', zero_division=0
    )

    print("\n" + "=" * 65)
    print(f"🎯 80/20 TEST SET EVALUATION ACCURACY: {acc * 100:.2f}%")
    print(f"   • Macro F1-Score:    {f1_macro * 100:.2f}%")
    print(f"   • Weighted F1-Score: {f1_weighted * 100:.2f}%")
    print("=" * 65)

    unique_labels = sorted(list(set(y_train).union(set(y_test))))
    report_dict = classification_report(y_test, y_pred, labels=unique_labels, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=unique_labels)

    per_class_metrics = []
    print("\nDetailed Per-Category Performance on Test Data:")
    print(f"{'Category':20s} {'Support':>8s} {'Precision':>10s} {'Recall':>10s} {'F1-Score':>10s}")
    print("-" * 62)
    for lbl in unique_labels:
        if lbl in report_dict:
            stats = report_dict[lbl]
            prec = stats['precision'] * 100
            rec = stats['recall'] * 100
            f1 = stats['f1-score'] * 100
            sup = int(stats['support'])
            per_class_metrics.append({
                'label': lbl,
                'support': sup,
                'precision': round(prec, 1),
                'recall': round(rec, 1),
                'f1': round(f1, 1),
            })
            print(f"{lbl:20s} {sup:8d} {prec:9.1f}% {rec:9.1f}% {f1:9.1f}%")

    misclassifications = []
    for i in range(len(y_test)):
        actual = y_test[i]
        pred = y_pred[i]
        if actual != pred:
            prob = float(np.max(y_proba[i]))
            row = test_df.iloc[i]
            misclassifications.append({
                'id': row['id'],
                'subject': row['clean_subject'],
                'sender': row['sender_domain'],
                'actual': actual,
                'predicted': pred,
                'confidence': round(prob * 100, 1),
            })

    print(f"\nMisclassified Test Samples: {len(misclassifications)} of {len(y_test)}")
    for m in misclassifications[:6]:
        print(f"  • Subject: \"{m['subject'][:45]}...\" | Actual: [{m['actual']}] -> Predicted: [{m['predicted']}] ({m['confidence']}%)")

    # Save artifacts
    artifacts_dir = os.path.join(os.path.dirname(__file__), '..', 'ml_artifacts')
    os.makedirs(artifacts_dir, exist_ok=True)

    metrics_payload = {
        'trained_at': datetime.utcnow().isoformat() + "Z",
        'total_samples': len(df),
        'train_samples': len(train_df),
        'test_samples': len(test_df),
        'test_accuracy': round(acc * 100, 2),
        'macro_f1': round(f1_macro * 100, 2),
        'weighted_f1': round(f1_weighted * 100, 2),
        'categories': unique_labels,
        'per_class_metrics': per_class_metrics,
        'confusion_matrix': cm.tolist(),
        'misclassifications': misclassifications,
    }

    metrics_file = os.path.join(artifacts_dir, 'model_metrics.json')
    with open(metrics_file, 'w', encoding='utf-8') as f:
        json.dump(metrics_payload, f, indent=2)

    pipeline_obj = {
        'vectorizer': vectorizer,
        'ensemble': ensemble,
        'labels': list(ensemble.classes_),
        'trained_at': metrics_payload['trained_at'],
    }
    model_file = os.path.join(artifacts_dir, 'classifier_pipeline.joblib')
    joblib.dump(pipeline_obj, model_file)
    print(f"\n💾 Saved pipeline to: {model_file}")
    print(f"📊 Saved metrics to:  {metrics_file}")

if __name__ == '__main__':
    evaluate_classifier()
