"""
Production-grade Rule-Weighted ML Classifier for Construction Bid Emails.
Improvements:
1. Excludes 'Unknown' and 'General' categories per user instructions.
2. Combines 'Addendum' and 'RFI/Forms' into a unified 'Addendum / RFI' category
   (both represent supplementary project information and job details).
3. Applies comprehensive deterministic rules for:
   - Addendum / RFI (Federal Amendments, Bulletins, Scopes, Alternates, Site Photos, RFIs, Wage Rates)
   - ITB (Invitations, RFPs, Bid Requests, Drawing Sets)
   - Date Reminder (Bids Due Today/Tomorrow, Follow-ups, Deadlines)
   - Contractor Awarded / Won (Awards, Subcontracts, Wins)
   - Lost (Regrets, Not Selected)
   - Spam (Marketing, SEO, Account Security)
"""

import os
import json
import re
import numpy as np
from collections import Counter
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
from scipy.sparse import hstack, csr_matrix
import joblib

DATASET_PATH = 'data/emails_dataset.jsonl'
OUTPUT_DIR = 'ml_artifacts'
MODEL_PATH = os.path.join(OUTPUT_DIR, 'classifier_pipeline.joblib')
METRICS_PATH = os.path.join(OUTPUT_DIR, 'model_metrics.json')

def extract_advanced_domain_rules(r):
    subj = (r.get('clean_subject') or r.get('original_subject') or '').lower()
    top = (r.get('top_message') or '').lower()
    body = (r.get('body_core_preview') or '').lower()
    att_names = " ".join(r.get('attachment_names', [])).lower()
    full_top = f"{subj} {top}"
    
    # 1. ADDENDUM / RFI Combined Rules
    r_addend_rfi_subj = 1.0 if re.search(
        r'\b(addend(um|a)|amendment\s*\d+|amendments?\b|bulletin\s*\d*|revision\s*\d*|rev\s*\d+|alternate(s)?|scopes? of work|site photos?|site pictures?|bid notice\s*\d+|clarification\s*(#|no\.?|\d+)|rfi\b|request for information|pre-bid|pre bid|bid form|workbook|key rates|wage rate|prevailing wage|site walk|sign-in sheet|tax exempt)\b',
        subj
    ) else 0.0
    
    r_addend_rfi_top = 1.0 if re.search(
        r'\b(addend|rfi response|rfi responses|bid form|wage scale|pre-bid rfi|questions and answers|q&a|clarification)\b',
        top
    ) else 0.0
    
    r_addend_rfi_att = 1.0 if re.search(
        r'\b(addend|bulletin|revised|amendment|rfi|bid form|wage)\b',
        att_names
    ) else 0.0
    
    # 2. DATE REMINDER RULES
    r_remind_subj = 1.0 if re.search(
        r'\b(reminder|due today|closing soon|bids due|deadline|last call|due tomorrow|bid due date|submit your bid|proposal reminder|bidding status|follow-up|follow up|participation follow-up|due\s+\d{1,2}/\d{1,2})\b',
        subj
    ) else 0.0
    
    r_remind_top = 1.0 if re.search(
        r'\b(reminder|bids due|due today|due tomorrow|deadline|closing soon|submit your bid|extended to|are you able to provide pricing|please confirm)\b',
        top
    ) else 0.0
    
    # 3. ITB RULES
    r_itb_subj = 1.0 if re.search(
        r'\b(invitation to bid|itb|request for proposal|rfp|bid invitation|seeking bids|bidding opportunity|bid request|new project for bid|request for budgeting|invite to bid|new bid opportunity|bid drawings)\b',
        subj
    ) else 0.0
    
    r_itb_top = 1.0 if re.search(
        r'\b(invitation to bid|pricing a new project|requesting subcontractor bids|seeking proposals)\b',
        top
    ) else 0.0

    # 4. AWARD / WON RULES
    r_award = 1.0 if re.search(
        r'\b(awarded|contractor awarded|intent to award|notice of award|winning bid|subcontract agreement|award update|bid result)\b',
        full_top
    ) else 0.0

    # 5. LOST RULES
    r_lost = 1.0 if re.search(
        r'\b(regret to inform|not selected|awarded to another|lost)\b',
        full_top
    ) else 0.0

    # 6. SPAM RULES
    r_spam = 1.0 if re.search(
        r'\b(seo|lead generation|website design|marketing agency|payroll|unsecured loan|merchant funding|backup code|reset your password)\b',
        full_top
    ) else 0.0

    return [
        r_addend_rfi_subj * 4.5,
        r_addend_rfi_top * 3.0,
        r_addend_rfi_att * 2.5,
        r_remind_subj * 4.0,
        r_remind_top * 3.0,
        r_itb_subj * 3.5,
        r_itb_top * 2.0,
        r_award * 5.0,
        r_lost * 5.0,
        r_spam * 5.0,
        1.0 if r.get('has_drawings') else 0.0,
        min(r.get('attachment_count', 0), 5) * 0.2
    ]

def prepare_weighted_text(r):
    subj = (r.get('clean_subject') or r.get('original_subject') or '')
    top = (r.get('top_message') or '')
    body = (r.get('body_core_preview') or '')
    return f"{subj} {subj} {subj} {subj} {top} {top} {body[:500]}"

def train_and_evaluate():
    print("🚀 Loading labeled dataset (combining Addendum & RFI/Forms, excluding Unknown & General)...")
    with open(DATASET_PATH, 'r', encoding='utf-8') as f:
        all_records = [json.loads(line) for line in f]
    
    records = []
    for r in all_records:
        l = r.get('label')
        # Exclude Unknown and General
        if l in ('Unknown', 'General', None):
            continue
        # Combine Addendum and RFI/Forms into unified category
        if l in ('Addendum', 'RFI/Forms'):
            rc = dict(r)
            rc['label'] = 'Addendum / RFI'
            records.append(rc)
        else:
            records.append(r)
            
    print(f"Total raw: {len(all_records)}, Active business records: {len(records)}")
    labels = [r['label'] for r in records]
    label_counts = Counter(labels)
    for c, cnt in label_counts.most_common():
        print(f"  {c}: {cnt}")
        
    rare_indices = [i for i, l in enumerate(labels) if label_counts[l] < 2]
    common_indices = [i for i, l in enumerate(labels) if label_counts[l] >= 2]
    common_labels = [labels[i] for i in common_indices]
    
    sss = StratifiedShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    for train_common_idx, test_common_idx in sss.split(common_indices, common_labels):
        train_indices = [common_indices[i] for i in train_common_idx] + rare_indices
        test_indices = [common_indices[i] for i in test_common_idx]
        
    print(f"\nTrain samples: {len(train_indices)}, Test samples: {len(test_indices)}")
    
    train_records = [records[i] for i in train_indices]
    test_records = [records[i] for i in test_indices]
    
    train_text = [prepare_weighted_text(r) for r in train_records]
    test_text = [prepare_weighted_text(r) for r in test_records]
    
    train_dense = np.array([extract_advanced_domain_rules(r) for r in train_records])
    test_dense = np.array([extract_advanced_domain_rules(r) for r in test_records])
    
    y_train = [r['label'] for r in train_records]
    y_test = [r['label'] for r in test_records]
    
    vectorizer = TfidfVectorizer(
        max_features=6000,
        ngram_range=(1, 3),
        min_df=2,
        sublinear_tf=True
    )
    
    X_train_sparse = vectorizer.fit_transform(train_text)
    X_test_sparse = vectorizer.transform(test_text)
    
    X_train = hstack([X_train_sparse, csr_matrix(train_dense)])
    X_test = hstack([X_test_sparse, csr_matrix(test_dense)])
    
    clf = LogisticRegression(
        C=5.0,
        class_weight='balanced',
        max_iter=1500,
        random_state=42
    )
    
    print("Training rule-weighted classifier...")
    clf.fit(X_train, y_train)
    
    y_pred = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    unique_classes = sorted(list(set(y_test) | set(y_pred)))
    report = classification_report(y_test, y_pred, labels=unique_classes, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=unique_classes)
    
    print(f"\n==========================================")
    print(f"🎯 Test Set Accuracy: {acc*100:.2f}%")
    print(f"📊 Weighted F1 Score: {report['weighted avg']['f1-score']*100:.2f}%")
    print(f"📊 Macro F1 Score: {report['macro avg']['f1-score']*100:.2f}%")
    print(f"==========================================\n")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    pipeline_bundle = {
        'vectorizer': vectorizer,
        'model': clf,
        'classes': list(clf.classes_)
    }
    joblib.dump(pipeline_bundle, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")
    
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
