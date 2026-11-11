import sys
import json
import os
import joblib
import numpy as np
import re
from scipy.sparse import hstack, csr_matrix

def extract_advanced_domain_rules_from_payload(subj, top, body, attachments):
    subj = (subj or '').lower()
    top = (top or '').lower()
    body = (body or '').lower()
    full_top = f"{subj} {top}"
    att_names = (attachments or '').lower()
    
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

    return np.array([[
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
        1.0 if ('drawing' in full_top or 'plan' in full_top) else 0.0,
        min(len(attachments.split(',')) if attachments else 0, 5) * 0.2
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

        text = f"{subj} {subj} {subj} {subj} {top} {top} {body[:500]}"
        X_text = vectorizer.transform([text])
        dense = extract_advanced_domain_rules_from_payload(subj, top, body, attachments)

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
