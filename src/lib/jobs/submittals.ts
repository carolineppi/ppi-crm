export type SubmittalStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'approved_as_noted'
  | 'revise_resubmit'
  | 'rejected';

export interface JobSubmittal {
  id: string;
  submittalNumber: string;
  title: string;
  manufacturer?: string | null;
  specSection?: string | null;
  status: SubmittalStatus;
  revision: number;
  submittedDate?: string | null;
  dueDate?: string | null;
  approvedDate?: string | null;
  submittedBy?: string | null;
  reviewer?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  notes?: string | null;
  updatedAt: string;
}

export const SUBMITTAL_STATUS_META: Record<
  SubmittalStatus,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: 'Pending Prep',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  submitted: {
    label: 'Submitted / In Review',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  approved: {
    label: 'Approved',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  approved_as_noted: {
    label: 'Approved as Noted',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  revise_resubmit: {
    label: 'Revise & Resubmit',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  rejected: {
    label: 'Rejected',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
  },
};

export function getSubmittalSummary(submittals: JobSubmittal[] | null | undefined) {
  const list = Array.isArray(submittals) ? submittals : [];
  const total = list.length;
  const approved = list.filter(
    (s) => s.status === 'approved' || s.status === 'approved_as_noted'
  ).length;
  const needsRevision = list.filter(
    (s) => s.status === 'revise_resubmit' || s.status === 'rejected'
  ).length;
  const inReview = list.filter((s) => s.status === 'submitted').length;
  const pending = list.filter((s) => s.status === 'pending').length;

  return {
    total,
    approved,
    needsRevision,
    inReview,
    pending,
    allApproved: total > 0 && approved === total,
    unapprovedList: list.filter(
      (s) => s.status !== 'approved' && s.status !== 'approved_as_noted'
    ),
  };
}
