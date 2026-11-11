"""
Example: Training a Fast, Deterministic Multiclass Classifier on your Email Datasheet
Requires: pip install pandas scikit-learn
Run: python scripts/train_classifier_example.py
"""

import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, confusion_matrix

def main():
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'emails_dataset.csv')
    if not os.path.exists(csv_path):
        print(f"❌ Dataset not found at {csv_path}. Run 'npm run export:data' first.")
        return

    # 1. Load exported datasheet
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} emails from {csv_path}")
    print("\nClass Distribution:")
    print(df['label'].value_counts())

    # We need classes with at least 2 samples to evaluate train/test split
    valid_classes = df['label'].value_counts()[df['label'].value_counts() >= 2].index
    df_filtered = df[df['label'].isin(valid_classes)].copy()

    # 2. Define Features (X) and Target Label (y)
    # engineered_text combines: Clean Subject + Attachments + Top Note + Body
    X = df_filtered['engineered_text'].fillna('')
    y = df_filtered['label']

    # 3. Stratified Split (80% Train, 20% Test)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nTraining set size: {len(X_train)} | Test set size: {len(X_test)}")

    # 4. Construct Scikit-Learn Pipeline
    # TfidfVectorizer extracts unigrams and bigrams, balancing rare and frequent words
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=5000,
            sublinear_tf=True
        )),
        ('clf', LogisticRegression(
            class_weight='balanced',  # Handles class imbalance (e.g. fewer Won/Lost emails)
            max_iter=1000,
            C=1.5
        ))
    ])

    # 5. Train the model
    print("\nTraining LogisticRegression classifier...")
    pipeline.fit(X_train, y_train)

    # 6. Evaluate accuracy & F1-score on holdout test set
    y_pred = pipeline.predict(X_test)
    print("\n================ Classification Report ================")
    print(classification_report(y_test, y_pred, zero_division=0))

    print("\n================ Confusion Matrix ================")
    print(confusion_matrix(y_test, y_pred))

    # 7. Test sample inference
    test_samples = [
        "Subject: INVITATION TO BID: Lincoln High School | Attachments: Plans.pdf | Body: Please submit pricing by Dec 1",
        "Subject: FW: INVITATION TO BID: Kroger #399 | Attachments: Addendum_1.pdf | Top Note: See attached Addendum #1",
        "Subject: Subcontract Agreement - St. Jude | Attachments: Subcontract.pdf | Body: Attached executed contract for signature",
        "Subject: Bid Results - Library Project | Body: We regret to inform you that we selected another subcontractor"
    ]

    print("\n================ Sample Predictions ================")
    preds = pipeline.predict(test_samples)
    probs = pipeline.predict_proba(test_samples)
    for sample, pred, prob in zip(test_samples, preds, probs):
        max_prob = max(prob)
        print(f"Prediction: [{pred}] (Confidence: {max_prob:.1%}) -> {sample[:80]}...")

if __name__ == '__main__':
    main()
