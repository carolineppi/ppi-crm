"""
Production-grade Hybrid Rule-Weighted ML Classifier for Construction Bid Emails.
Combines:
1. Positional Deterministic Rules (Subject & Top-Message high-precision priors)
2. Positional Text Weighting (Subject x3, Top-Message x2, Body x1)
3. Domain Keywords (Scopes of work, Bulletins, Prequalification, Planrooms)
4. Balanced Soft-Voting Ensemble (LogisticRegression + ComplementNB)
"""

import os
import json
import re
import numpy as np
from collections import Counter
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import ComplementNB
from sklearn.ensemble import VotingClassifier
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
from scipy.sparse import hstack, csr_matrix
import joblib

DATASET_PATH = 'data/emails_dataset.jsonl'
OUTPUT_DIR = 'ml_artifacts'
MODEL_PATH = os.path.join(OUTPUT_DIR, 'classifier_pipeline.joblib')
METRICS_PATH = os.path.join(OUTPUT_DIR, 'model_metrics.json')

def extract_domain_rule_vector(r):
    """
    Extracts high-precision deterministic rules based on positional location.
    Location is everything: Subject >> Top 3 Lines >> Body Footer.
    """
    subj = (r.get('clean_subject') or r.get('original_subject') or '').lower()
    top = (r.get('top_message') or '').lower()
    body = (r.get('body_core_preview') or '').lower()
    full = f"{subj} {top} {body}"
    att_names = " ".join(r.get('attachment_names', [])).lower()
    
    # Rule 1: Explicit Addendum in Subject (92% accurate on its own)
    r_addend_subj = 1.0 if re.search(r'\baddend(um|a)\b', subj) else 0.0
    
    # Rule 2: Construction supplement terms in Subject (Bulletins, Alternates, Scopes of Work, Site Photos)
    r_addend_supp = 1.0 if re.search(r'\b(bulletin|revision|rev\s*\d+|alternate(s)?|scopes? of work|site photos?|site pictures?)\b', subj) else 0.0
    
    # Rule 3: Addendum in attachment filename
    r_addend_att = 1.0 if re.search(r'\baddend(um|a)\b', att_names) else 0.0
    
    # Rule 4: Date Reminder in Subject or Top 3 lines
    r_remind_subj = 1.0 if re.search(r'\b(reminder|due today|closing soon|bids due|deadline|last call|due tomorrow|bid due date extension)\b', subj) else 0.0
    r_remind_top = 1.0 if re.search(r'\b(reminder|bids due|due today|due tomorrow|deadline|closing soon)\b', top) else 0.0
    
    # Rule 5: RFI / Clarification in Subject
    r_rfi_subj = 1.0 if re.search(r'\brfi\b|\brequest for information\b|\bclarification\b', subj) and not r_addend_subj else 0.0
    r_rfi_top = 1.0 if re.search(r'\brfi\b|\brequest for information\b|\bclarification response\b', top) else 0.0
    
    # Rule 6: ITB / Bid Opportunity in Subject
    r_itb_subj = 1.0 if re.search(r'\b(invitation to bid|itb|request for proposal|rfp|bid invitation|seeking bids|bidding opportunity|bid request|new project|plans available)\b', subj) else 0.0
    
    # Rule 7: Pre-qualification / TradeTapp (identifies what was previously clogging Unknown)
    r_prequal = 1.0 if re.search(r'\b(tradetapp|qualify|qualification application|compass|prequal)\b', full) else 0.0
    
    # Rule 8: Awards & Wins
    r_award = 1.0 if re.search(r'\b(awarded|contractor awarded|intent to award|notice of award|winning bid|subcontract agreement)\b', subj) else 0.0
    
    # Rule 9: Lost / Regret
    r_lost = 1.0 if re.search(r'\b(regret to inform|bid results|not selected|awarded to another|lost)\b', subj) else 0.0
    
    # Rule 10: Marketing / Spam
    r_spam = 1.0 if re.search(r'\b(seo|lead generation|website design|marketing agency|payroll|unsecured loan|merchant funding)\b', subj + ' ' + top) else 0.0

    return [
        r_addend_subj * 3.5,
        r_addend_supp * 2.5,
        r_addend_att * 2.0,
        r_remind_subj * 3.5,
        r_remind_top * 2.0,
        r_rfi_subj * 3.0,
        r_rfi_top * 1.5,
        r_itb_subj * 3.0,
        r_prequal * 3.0,
        r_award * 4.0,
        r_lost * 4.0,
        r_spam * 4.0,
        1.0 if r.get('has_drawings') else 0.0,
        min(r.get('attachment_count', 0), 5) * 0.2
    ]

def prepare_weighted_text(r):
    subj = (r.get('clean_subject') or r.get('original_subject') or '')
    top = (r.get('top_message') or '')
    body = (r.get('body_core_preview') or '')
    # Tripling the subject and doubling top message forces the vectorizer to focus on intent over boilerplate
    return f"{subj} {subj} {subj} {top} {top} {body[:600]}"

def train_and_evaluate():
    print("🚀 Loading labeled dataset...")
    with open(DATASET_PATH, 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f]
    
    print(f"Loaded {len(records)} records.")
    
    labels = [r['label'] for r in records]
    label_counts = Counter(labels)
    
    # Separate rare classes (< 2 instances) for stratified split
    rare_indices = [i for i, l in enumerate(labels) if label_counts[l] < 2]
    common_indices = [i for i, l in enumerate(labels) if label_counts[l] >= 2]
    common_labels = [labels[i] for i in common_indices]
    
    sss = StratifiedShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    for train_common_idx, test_common_idx in sss.split(common_indices, common_labels):
        train_indices = [common_indices[i] for i in train_common_idx] + rare_indices
        test_indices = [common_indices[i] for i in test_common_idx]
        
    print(f"Train samples: {len(train_indices)}, Test samples: {len(test_indices)}")
    
    train_records = [records[i] for i in train_indices]
    test_records = [records[i] for i in test_indices]
    
    train_text = [prepare_weighted_text(r) for r in train_records]
    test_text = [prepare_weighted_text(r) for r in test_records]
    
    train_dense = np.array([extract_domain_rule_vector(r) for r in train_records])
    test_dense = np.array([extract_domain_rule_vector(r) for r in test_records])
    
    y_train = [r['label'] for r in train_records]
    y_test = [r['label'] for r in test_records]
    
    # TF-IDF Vectorizer
    vectorizer = TfidfVectorizer(
        max_features=4500,
        ngram_range=(1, 3),
        min_df=2,
        sublinear_tf=True
    )
    
    X_train_sparse = vectorizer.fit_transform(train_text)
    X_test_sparse = vectorizer.transform(test_text)
    
    X_train = hstack([X_train_sparse, csr_matrix(train_dense)])
    X_test = hstack([X_test_sparse, csr_matrix(test_dense)])
    
    # Soft voting ensemble
    clf_lr = LogisticRegression(C=3.5, class_weight='balanced', max_iter=1000, random_state=42)
    clf_nb = ComplementNB(alpha=0.35)
    
    ensemble = VotingClassifier(
        estimators=[('lr', clf_lr), ('nb', clf_nb)],
        voting='soft'
    )
    
    print("Training rule-weighted ensemble model...")
    ensemble.fit(X_train, y_train)
    
    y_pred = ensemble.predict(X_test)
    y_proba = ensemble.predict_proba(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    unique_classes = sorted(list(set(y_test) | set(y_pred)))
    report = classification_report(y_test, y_pred, labels=unique_classes, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=unique_classes)
    
    print(f"\n==========================================")
    print(f"🎯 Test Set Accuracy: {acc*100:.2f}%")
    print(f"📊 Weighted F1 Score: {report['weighted avg']['f1-score']*100:.2f}%")
    print(f"==========================================\n")
    
    # Save artifacts
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    pipeline_bundle = {
        'vectorizer': vectorizer,
        'model': ensemble,
        'classes': list(ensemble.classes_)
    }
    joblib.dump(pipeline_bundle, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")
    
    # Format metrics for the frontend lab
    metrics = {
        'total_samples': len(records),
        'train_samples': len(train_indices),
        'test_samples': len(test_indices),
        'accuracy': float(acc),
        'weighted_f1': float(report['weighted avg']['f1-score']),
        'macro_f1': float(report['macro avg']['f1-score']),
        'classes': unique_classes,
        'confusion_matrix': cm.tolist(),
        'per_class_metrics': {
            cls: {
                'precision': float(report[cls]['precision']),
                'recall': float(report[cls]['recall']),
                'f1': float(report[cls]['f1-score']),
                'support': int(report[cls]['support'])
            }
            for cls in unique_classes if cls in report
        },
        'misclassified_samples': []
    }
    
    for idx, (true_l, pred_l, test_rec, proba) in enumerate(zip(y_test, y_pred, test_records, y_proba)):
        if true_l != pred_l:
            conf = float(np.max(proba))
            metrics['misclassified_samples'].append({
                'id': test_rec.get('id', idx),
                'subject': test_rec.get('clean_subject') or test_rec.get('original_subject', 'No Subject'),
                'true_label': true_l,
                'predicted_label': pred_l,
                'confidence': round(conf * 100, 1),
                'snippet': (test_rec.get('top_message') or test_rec.get('body_core_preview') or '')[:140]
            })
            
    with open(METRICS_PATH, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2)
        
    print(f"Saved metrics to {METRICS_PATH}")

if __name__ == '__main__':
    train_and_evaluate()
