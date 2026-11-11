import sys
import json
import os
import joblib
import numpy as np
import re
from scipy.sparse import hstack, csr_matrix

def extract_domain_rule_vector_from_payload(subj, top, body, attachments):
    subj = (subj or '').lower()
    top = (top or '').lower()
    body = (body or '').lower()
    full = f"{subj} {top} {body}"
    att_names = (attachments or '').lower()
    
    r_addend_subj = 1.0 if re.search(r'\baddend(um|a)\b', subj) else 0.0
    r_addend_supp = 1.0 if re.search(r'\b(bulletin|revision|rev\s*\d+|alternate(s)?|scopes? of work|site photos?|site pictures?)\b', subj) else 0.0
    r_addend_att = 1.0 if re.search(r'\baddend(um|a)\b', att_names) else 0.0
    
    r_remind_subj = 1.0 if re.search(r'\b(reminder|due today|closing soon|bids due|deadline|last call|due tomorrow|bid due date extension)\b', subj) else 0.0
    r_remind_top = 1.0 if re.search(r'\b(reminder|bids due|due today|due tomorrow|deadline|closing soon)\b', top) else 0.0
    
    r_rfi_subj = 1.0 if re.search(r'\brfi\b|\brequest for information\b|\bclarification\b', subj) and not r_addend_subj else 0.0
    r_rfi_top = 1.0 if re.search(r'\brfi\b|\brequest for information\b|\bclarification response\b', top) else 0.0
    
    r_itb_subj = 1.0 if re.search(r'\b(invitation to bid|itb|request for proposal|rfp|bid invitation|seeking bids|bidding opportunity|bid request|new project|plans available)\b', subj) else 0.0
    r_prequal = 1.0 if re.search(r'\b(tradetapp|qualify|qualification application|compass|prequal)\b', full) else 0.0
    r_award = 1.0 if re.search(r'\b(awarded|contractor awarded|intent to award|notice of award|winning bid|subcontract agreement)\b', subj) else 0.0
    r_lost = 1.0 if re.search(r'\b(regret to inform|bid results|not selected|awarded to another|lost)\b', subj) else 0.0
    r_spam = 1.0 if re.search(r'\b(seo|lead generation|website design|marketing agency|payroll|unsecured loan|merchant funding)\b', subj + ' ' + top) else 0.0

    return np.array([[
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
        1.0 if ('drawing' in full or 'plan' in full) else 0.0,
        0.4 if attachments else 0.0
    ]])

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({'error': 'No input received'}))
            sys.exit(1)

        payload = json.loads(raw_input)
        subj = str(payload.get('subject') or '')
        body = str(payload.get('bodyText') or '')
        attachments = str(payload.get('attachments') or '')
        top = body[:400]

        artifacts_dir = os.path.join(os.path.dirname(__file__), '..', 'ml_artifacts')
        model_file = os.path.join(artifacts_dir, 'classifier_pipeline.joblib')

        if not os.path.exists(model_file):
            print(json.dumps({'error': 'Model not trained yet'}))
            sys.exit(1)

        pipeline = joblib.load(model_file)
        vectorizer = pipeline['vectorizer']
        model = pipeline.get('model') or pipeline.get('ensemble')

        text = f"{subj} {subj} {subj} {top} {top} {body[:600]}"
        X_text = vectorizer.transform([text])
        dense = extract_domain_rule_vector_from_payload(subj, top, body, attachments)

        X_combined = hstack([X_text, csr_matrix(dense)])
        probs = model.predict_proba(X_combined)[0]
        classes = model.classes_

        class_probs = {classes[i]: round(float(probs[i]) * 100, 1) for i in range(len(classes))}
        sorted_probs = dict(sorted(class_probs.items(), key=lambda x: x[1], reverse=True))
        predicted_class = list(sorted_probs.keys())[0]
        confidence = list(sorted_probs.values())[0]

        print(json.dumps({
            'success': True,
            'predictedClass': predicted_class,
            'confidence': confidence,
            'probabilities': sorted_probs,
        }))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
