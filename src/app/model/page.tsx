'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Brain,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  BarChart3,
  Layers,
  Tag,
  Target,
  Send,
  Zap,
  Info,
  ChevronRight,
  TrendingUp,
  FileText,
  Clock,
  ExternalLink,
  ShieldAlert,
  UserCheck
} from 'lucide-react';

interface PerClassMetric {
  label: string;
  support: number;
  precision: number;
  recall: number;
  f1: number;
}

interface Misclassification {
  id: string;
  subject: string;
  sender: string;
  actual: string;
  predicted: string;
  confidence: number;
}

interface ModelMetrics {
  trained_at: string;
  total_samples: number;
  train_samples: number;
  test_samples: number;
  test_accuracy: number;
  macro_f1: number;
  weighted_f1: number;
  categories: string[];
  per_class_metrics: PerClassMetric[];
  confusion_matrix: number[][];
  misclassifications: Misclassification[];
}

export default function ModelLabPage() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetraining, setIsRetraining] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Playground State
  const [testSubject, setTestSubject] = useState('Invitation to Bid - Riverside Health Pavilion Restroom Accessories');
  const [testSender, setTestSender] = useState('estimating@gilbanebuilding.com');
  const [testBody, setTestBody] = useState(
    'Please see attached plans and specifications for the Riverside Health Pavilion. Partition Plus is invited to submit proposals for Division 10 specialties before Friday Dec 18 at 2:00 PM.'
  );
  const [testAttachments, setTestAttachments] = useState('specs_sec10.pdf, drawings_arch.dwg');
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState<any>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchMetrics = async (retrain = false) => {
    if (retrain) setIsRetraining(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`/api/ml/metrics${retrain ? '?retrain=true' : ''}`);
      const data = await res.json();
      if (data.metrics) {
        setMetrics(data.metrics);
        if (retrain) showToast('✔ ML Model re-trained and metrics refreshed!');
      } else {
        showToast(data.error || 'Failed to load model metrics');
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
      setIsRetraining(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleTestPredict = async () => {
    setIsPredicting(true);
    try {
      const res = await fetch('/api/ml/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: testSubject,
          bodyText: testBody,
          senderEmail: testSender,
          attachments: testAttachments,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPredictionResult(data);
      } else {
        showToast(data.error || 'Prediction failed');
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setIsPredicting(false);
    }
  };

  const setPreset = (presetType: string) => {
    if (presetType === 'ITB') {
      setTestSubject('INVITATION TO BID: St. Jude Medical Clinic - Toilet Partitions');
      setTestSender('bids@turnerconstruction.com');
      setTestBody('Turner Construction invites your firm to submit pricing for the toilet partitions and washroom accessories. Proposals are due 12/15 at 3:00 PM.');
      setTestAttachments('Spec_Div10.pdf, Plans_A101.pdf');
    } else if (presetType === 'Addendum') {
      setTestSubject('Addendum #2 & Revised Architectural Sheets - County Courthouse');
      setTestSender('notifications@smartbidnet.com');
      setTestBody('Please review Addendum #2 including revised toilet partition layout in restrooms on level 2. The bid due date remains unchanged.');
      setTestAttachments('Addendum_02.pdf, A201_Rev.pdf');
    } else if (presetType === 'Reminder') {
      setTestSubject('REMINDER: Proposals Due Tomorrow at 12:00 PM - Harbor View');
      setTestSender('estimating@whiting-turner.com');
      setTestBody('Friendly reminder that bids for the Harbor View project are due tomorrow at noon. Please confirm if you will be submitting a quote.');
      setTestAttachments('');
    } else if (presetType === 'RFI') {
      setTestSubject('RFI Responses #1-4 & Pre-Bid Sign-In Sheet - Escapology');
      setTestSender('pm@davisconstruction.com');
      setTestBody('Attached are responses to contractor RFIs regarding ceiling heights in restrooms, plus the pre-bid conference sign-in log.');
      setTestAttachments('RFI_Log_Responses.pdf, PreBid_SignIn.pdf');
    } else if (presetType === 'Award') {
      setTestSubject('Notice of Award / Prime Contract - Maryland State Archives');
      setTestSender('contracts@gilbanebuilding.com');
      setTestBody('Gilbane Building Company has been awarded the prime contract for the State Archives renovation. We are finalizing our subcontractor packages.');
      setTestAttachments('Prime_Award_Notice.pdf');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in border border-slate-700">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Breadcrumb & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors shadow-2xs flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dispatch Dashboard</span>
          </Link>
          <Link
            href="/label"
            className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors shadow-2xs flex items-center gap-1.5 text-xs font-semibold"
          >
            <Tag className="w-4 h-4 text-purple-600" />
            <span>Data Labeling App</span>
          </Link>
        </div>

        <button
          onClick={() => fetchMetrics(true)}
          disabled={isRetraining}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRetraining ? 'animate-spin' : ''}`} />
          <span>{isRetraining ? 'Training Model...' : 'Re-Train on Latest Verified Data'}</span>
        </button>
      </div>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-mono font-bold border border-blue-500/30">
            <Brain className="w-3.5 h-3.5" /> Multiclass Text Classification Algorithm
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Commercial Email Classification Lab
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Evaluates machine learning models trained on <strong>{metrics?.total_samples || '549'}</strong> business emails labeled by Partition Plus (with ambiguous <em>Unknown</em> emails excluded per instructions). Evaluated with an <strong>80/20 Stratified Train/Test Split</strong> across all active commercial categories.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span>Loading model evaluation metrics...</span>
        </div>
      ) : metrics ? (
        <>
          {/* KPI Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-emerald-600" /> 80/20 Test Accuracy
              </span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {metrics.test_accuracy}%
              </div>
              <p className="text-[11px] text-emerald-700 font-semibold">
                Evaluated on held-out test data
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" /> Weighted F1-Score
              </span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {metrics.weighted_f1}%
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Macro F1: {metrics.macro_f1}%
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-purple-600" /> Dataset Split
              </span>
              <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {metrics.train_samples} / {metrics.test_samples}
              </div>
              <p className="text-[11px] text-purple-700 font-semibold">
                80% Train ({metrics.train_samples}) • 20% Test ({metrics.test_samples})
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-600" /> Pipeline Architecture
              </span>
              <div className="text-base font-bold text-slate-800 tracking-tight leading-snug">
                Rule-Weighted Classifier
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Domain Priors + Positional N-grams + Regularized Logistic Regression
              </p>
            </div>
          </div>

          {/* 98% Accuracy Roadmap Alert Card */}
          <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <h3 className="font-bold text-amber-950 text-sm">
                Active Architecture: Deterministic Domain Rules + Weighted Machine Learning
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-amber-900 leading-relaxed pt-1">
              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 space-y-1">
                <span className="font-bold text-amber-950 flex items-center gap-1">
                  1. "Unknown" Category Excluded
                </span>
                <p>
                  76 ambiguous emails were excluded from training per your instructions. The model now focuses exclusively on definitive business categories (ITB, Addendum, RFI/Forms, Date Reminder, Won, Lost, Spam).
                </p>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 space-y-1">
                <span className="font-bold text-amber-950 flex items-center gap-1">
                  2. Full Deterministic Rules Applied
                </span>
                <p>
                  Domain rules for Federal Amendments, Scopes of Work, Bulletins, Alternates, Reminders, and RFIs inject high-priority positional weights (Subject &gt; Top message &gt; Body).
                </p>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 space-y-1">
                <span className="font-bold text-amber-950 flex items-center gap-1">
                  3. Multi-Tier Hybrid Production
                </span>
                <p>
                  Rule-weighted ML delivers instantaneous zero-cost triage in milliseconds. The LLM is then targeted specifically for deep entity extraction (job name, address, due dates).
                </p>
              </div>
            </div>
          </div>

          {/* Main Grid: Per-Category Table & Interactive Confusion Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Per-Category Performance Table */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    Per-Category Test Set Performance
                  </h3>
                  <p className="text-xs text-slate-500">
                    Precision, Recall, and F1-Score on the held-out 20% test partition
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-y border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-2 text-center">Test Samples</th>
                      <th className="py-2.5 px-2 text-center">Precision</th>
                      <th className="py-2.5 px-2 text-center">Recall</th>
                      <th className="py-2.5 px-2 text-center">F1-Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.per_class_metrics.map((row) => (
                      <tr key={row.label} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {row.label}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                          {row.support}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            row.precision >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {row.precision}%
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            row.recall >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {row.recall}%
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            row.f1 >= 75 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {row.f1}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Confusion Matrix Heatmap */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  Confusion Matrix (Actual vs Predicted)
                </h3>
                <p className="text-xs text-slate-500">
                  Rows represent true categories; columns represent model predictions
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                  <div className="grid text-[10px] font-bold text-slate-500 text-center mb-1" style={{ gridTemplateColumns: `80px repeat(${metrics.categories.length}, minmax(0, 1fr))` }}>
                    <div></div>
                    {metrics.categories.map((c) => (
                      <div key={`col-${c}`} className="truncate px-1" title={c}>
                        {c.slice(0, 4)}
                      </div>
                    ))}
                  </div>

                  {metrics.confusion_matrix.map((row, rowIdx) => (
                    <div
                      key={`row-${rowIdx}`}
                      className="grid items-center text-xs mb-1"
                      style={{ gridTemplateColumns: `80px repeat(${metrics.categories.length}, minmax(0, 1fr))` }}
                    >
                      <div className="text-[11px] font-bold text-slate-700 truncate pr-2" title={metrics.categories[rowIdx]}>
                        {metrics.categories[rowIdx]}
                      </div>
                      {row.map((val, colIdx) => {
                        const isDiagonal = rowIdx === colIdx;
                        let cellBg = 'bg-slate-50 text-slate-400';
                        if (isDiagonal && val > 0) {
                          cellBg = 'bg-emerald-500 text-white font-bold';
                        } else if (!isDiagonal && val > 0) {
                          cellBg = val >= 3 ? 'bg-rose-100 text-rose-900 font-bold' : 'bg-amber-100 text-amber-900 font-semibold';
                        }
                        return (
                          <div
                            key={`cell-${rowIdx}-${colIdx}`}
                            className={`h-7 flex items-center justify-center rounded text-[11px] font-mono mx-0.5 ${cellBg}`}
                            title={`True: ${metrics.categories[rowIdx]} | Pred: ${metrics.categories[colIdx]} | Count: ${val}`}
                          >
                            {val}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Live Classifier Sandbox */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600" />
                  Live Classification Playground
                </h3>
                <p className="text-xs text-slate-500">
                  Paste any commercial email subject and text to test the classifier in real time
                </p>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Presets:</span>
                <button
                  type="button"
                  onClick={() => setPreset('ITB')}
                  className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-bold transition-colors"
                >
                  ITB
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('Addendum')}
                  className="px-2.5 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 text-[11px] font-bold transition-colors"
                >
                  Addendum
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('Reminder')}
                  className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-bold transition-colors"
                >
                  Date Reminder
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('RFI')}
                  className="px-2.5 py-1 rounded bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-[11px] font-bold transition-colors"
                >
                  RFI/Forms
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('Award')}
                  className="px-2.5 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 text-[11px] font-bold transition-colors"
                >
                  Award Notice
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700">Email Subject:</label>
                  <input
                    type="text"
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    placeholder="Enter email subject line..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700">Sender Email:</label>
                    <input
                      type="text"
                      value={testSender}
                      onChange={(e) => setTestSender(e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. estimator@skanska.com"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">Attachments (comma separated):</label>
                    <input
                      type="text"
                      value={testAttachments}
                      onChange={(e) => setTestAttachments(e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Addendum1.pdf, Specs.pdf"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700">Email Body / Message Text:</label>
                  <textarea
                    rows={4}
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                    placeholder="Paste the email body or note text..."
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTestPredict}
                  disabled={isPredicting || !testSubject}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Brain className="w-4 h-4" />
                  <span>{isPredicting ? 'Classifying...' : 'Classify Email Live'}</span>
                </button>
              </div>

              {/* Prediction Result Display */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Model Inference Output:
                  </span>

                  {predictionResult ? (
                    <div className="mt-3 space-y-4">
                      <div className="space-y-1">
                        <span className="text-xs text-slate-500">Predicted Category:</span>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-lg text-sm font-black bg-blue-600 text-white shadow-sm">
                            {predictionResult.predictedClass}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-700">
                            ({predictionResult.confidence}% Confidence)
                          </span>
                        </div>
                      </div>

                      {/* Probability Bars */}
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <span className="text-[11px] font-bold text-slate-700">
                          Class Probabilities:
                        </span>
                        <div className="space-y-1.5">
                          {Object.entries(predictionResult.probabilities || {})
                            .slice(0, 5)
                            .map(([label, prob]: [string, any]) => (
                              <div key={label} className="space-y-0.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="font-semibold text-slate-700">{label}</span>
                                  <span className="font-mono text-slate-500">{prob}%</span>
                                </div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${prob}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs mt-4">
                      Click <strong>Classify Email Live</strong> to run inference on the input text.
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  <span>Powered by calibrated scikit-learn pipeline</span>
                </div>
              </div>
            </div>
          </div>

          {/* Misclassifications Deep Dive Table */}
          {metrics.misclassifications && metrics.misclassifications.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Misclassification Inspector ({metrics.misclassifications.length} of {metrics.test_samples} test samples)
                </h3>
                <p className="text-xs text-slate-500">
                  Review test cases where model predictions diverged from human labels
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-y border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Subject Line</th>
                      <th className="py-2.5 px-2">Sender Domain</th>
                      <th className="py-2.5 px-2 text-center">User Label (Actual)</th>
                      <th className="py-2.5 px-2 text-center">Model Prediction</th>
                      <th className="py-2.5 px-2 text-center">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.misclassifications.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-900 max-w-sm truncate" title={m.subject}>
                          {m.subject}
                        </td>
                        <td className="py-2.5 px-2 text-slate-500 font-mono text-[11px]">
                          {m.sender || 'unknown'}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300">
                            {m.actual}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-rose-50 text-rose-800 border border-rose-300">
                            {m.predicted}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-600 text-[11px]">
                          {m.confidence}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-12 text-center text-slate-400">
          No metrics available. Please train the model.
        </div>
      )}
    </div>
  );
}
