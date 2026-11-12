import json
import joblib
import numpy as np
import os
import re

artifacts_dir = os.path.join(os.path.dirname(__file__), '..', 'ml_artifacts')
model_file = os.path.join(artifacts_dir, 'classifier_pipeline.joblib')
export_file = os.path.join(artifacts_dir, 'model_export.json')

pipeline = joblib.load(model_file)
vec = pipeline['vectorizer']
model = pipeline.get('model') or pipeline.get('ensemble')

export_data = {
    'classes': list(model.classes_),
    'intercept': [round(float(x), 6) for x in model.intercept_],
    'coef': [[round(float(c), 6) for c in row] for row in model.coef_],
    'idf': [round(float(x), 6) for x in vec.idf_],
    'vocabulary': {k: int(v) for k, v in vec.vocabulary_.items()},
    'ngram_range': list(vec.ngram_range),
    'sublinear_tf': bool(vec.sublinear_tf),
}

with open(export_file, 'w', encoding='utf-8') as f:
    json.dump(export_data, f)

print(f"Exported successfully to {export_file}. File size: {os.path.getsize(export_file)} bytes")
