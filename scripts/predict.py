import sys
import json
import os
import joblib
import numpy as np
import re
from scipy.sparse import hstack

REMINDER_PATTERNS = re.compile(r'\b(reminder|friendly reminder|bids are due|bids due|due tomorrow|due today|following up|follow up|confirm if you|confirm whether|bidding status|please confirm|will you be bidding|intend to bid|bid extension)\b', re.I)
RFI_PATTERNS = re.compile(r'\b(rfi|request for information|clarification|pre-bid|pre bid|site visit|questions? and answers?|q&a|bid form|sign in sheet|wage scale|wage rate|tax exempt|prevailing wage)\b', re.I)
ADDENDUM_PATTERNS = re.compile(r'\b(addendum|addenda|bulletin|revised drawings?|revised plans?|plan revision|re-issued|reissue|drawing update|spec update|narrative)\b', re.I)
AWARD_PATTERNS = re.compile(r'\b(awarded|prime award|low bidder|won the job|contract award|congratulations|selected as|notice of award|intent to award)\b', re.I)
ITB_PATTERNS = re.compile(r'\b(invitation to bid|invite to bid|invites you to bid|request for proposal|rfp|new project for bid|itb|invites partition plus|bidding opportunity)\b', re.I)

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
        sender = str(payload.get('senderEmail') or '')

        artifacts_dir = os.path.join(os.path.dirname(__file__), '..', 'ml_artifacts')
        model_file = os.path.join(artifacts_dir, 'classifier_pipeline.joblib')

        if not os.path.exists(model_file):
            print(json.dumps({'error': 'Model not trained yet'}))
            sys.exit(1)

        pipeline = joblib.load(model_file)
        vectorizer = pipeline['vectorizer']
        ensemble = pipeline['ensemble']

        text = f"SUBJECT_{subj} SUBJECT_{subj} TOP_{body[:400]} TOP_{body[:400]} ATTACH_{attachments} DOMAIN_{sender} {body}"
        X_text = vectorizer.transform([text])

        f_reminder_top = 1.0 if REMINDER_PATTERNS.search(body[:500]) else 0.0
        f_reminder_subj = 1.0 if REMINDER_PATTERNS.search(subj) else 0.0
        f_rfi = 1.0 if (RFI_PATTERNS.search(subj) or RFI_PATTERNS.search(body[:500]) or RFI_PATTERNS.search(attachments)) else 0.0
        f_addendum = 1.0 if (ADDENDUM_PATTERNS.search(subj) or ADDENDUM_PATTERNS.search(attachments)) else 0.0
        f_award = 1.0 if (AWARD_PATTERNS.search(subj) or AWARD_PATTERNS.search(body[:500])) else 0.0
        f_itb = 1.0 if (ITB_PATTERNS.search(subj) or ITB_PATTERNS.search(body[:500])) else 0.0

        dense = np.array([[
            f_reminder_top * 3.0,
            f_reminder_subj * 2.5,
            f_rfi * 3.0,
            f_addendum * 3.5,
            f_award * 3.0,
            f_itb * 2.0,
            1.0 if attachments else 0.0,
            0.0,
            len(subj) / 100.0,
            len(body) / 500.0
        ]])

        X_combined = hstack([X_text, dense]).tocsr()
        probs = ensemble.predict_proba(X_combined)[0]
        classes = ensemble.classes_

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
