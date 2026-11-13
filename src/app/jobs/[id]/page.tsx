'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  FileText,
  PackageCheck,
  FileDiff,
  CalendarClock,
  CheckCircle2,
  UserCheck,
  DollarSign,
  Send,
  Star,
  Plus,
  Trash2,
  MessageSquarePlus,
  StickyNote,
  AlertTriangle,
  Sun,
  Moon,
} from 'lucide-react';
import InstallCalendarMicroView, {
  CalendarDaySummary,
} from '@/components/InstallCalendarMicroView';

export default function JobViewerPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;

  const [job, setJob] = useState<any>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [materialEta, setMaterialEta] = useState('');
  const [siteAvailableRange, setSiteAvailableRange] = useState('');
  const [requestedInstallDate, setRequestedInstallDate] = useState('');
  const [installAvailabilityNotes, setInstallAvailabilityNotes] = useState('');
  const [siteOpenDays, setSiteOpenDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [workShift, setWorkShift] = useState<'Day' | 'Night' | 'Flexible'>('Day');
  const [isPriority, setIsPriority] = useState(false);
  const [priorityReason, setPriorityReason] = useState('');
  const [estimatedDurationDays, setEstimatedDurationDays] = useState('1');
  const [crewSizeNeeded, setCrewSizeNeeded] = useState('');
  const [installTickets, setInstallTickets] = useState<any[]>([]);
  const [calendarSummary, setCalendarSummary] = useState<Record<string, CalendarDaySummary>>({});
  const [defaultDailyLimit, setDefaultDailyLimit] = useState<number>(3);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState<string | null>(null);
  const [scheduleErrorMsg, setScheduleErrorMsg] = useState<string | null>(null);

  // Contacts state
  type JobContact = {
    id: string;
    name: string;
    role?: string;
    company?: string;
    phone?: string;
    email?: string;
    isPrimary: boolean;
  };
  const [contacts, setContacts] = useState<JobContact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    role: '',
    phone: '',
    email: '',
    isPrimary: false,
  });
  const [isSavingContacts, setIsSavingContacts] = useState(false);

  // PM Notes & POC Communication Log state
  type PmNoteEntry = {
    id: string;
    author: string;
    category: 'poc_comm' | 'pm_note' | 'site_update';
    content: string;
    createdAt: string;
  };
  const [pmNotesLog, setPmNotesLog] = useState<PmNoteEntry[]>([]);
  const [noteCategory, setNoteCategory] = useState<'poc_comm' | 'pm_note' | 'site_update'>('poc_comm');
  const [noteContent, setNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [generalNotes, setGeneralNotes] = useState('');
  const [isSavingGeneralNotes, setIsSavingGeneralNotes] = useState(false);
  const [generalNotesSavedMsg, setGeneralNotesSavedMsg] = useState<string | null>(null);

  const loadJob = async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        setPurchaseOrders(data.purchaseOrders || []);
        setChangeOrders(data.changeOrders || []);
        setMaterialEta(data.job.material_eta || '');
        setSiteAvailableRange(data.job.site_available_range || '');
        setRequestedInstallDate(data.job.requested_install_date || '');
        setInstallAvailabilityNotes(data.job.install_availability_notes || '');
        setGeneralNotes(data.job.notes || '');
        setPmNotesLog(Array.isArray(data.job.pm_notes_log) ? data.job.pm_notes_log : []);

        const existingContacts: JobContact[] = Array.isArray(data.job.contacts) ? data.job.contacts : [];
        if (existingContacts.length > 0) {
          setContacts(existingContacts);
        } else if (data.job.client_name || data.job.client_phone || data.job.client_email) {
          setContacts([
            {
              id: 'primary-init',
              name: data.job.client_name || data.job.client_company || 'Primary Contact',
              company: data.job.client_company || undefined,
              phone: data.job.client_phone || undefined,
              email: data.job.client_email || undefined,
              isPrimary: true,
            },
          ]);
        } else {
          setContacts([]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveContacts = async (updatedContacts: JobContact[]) => {
    setIsSavingContacts(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: updatedContacts }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        setContacts(Array.isArray(data.job.contacts) ? data.job.contacts : updatedContacts);
      }
    } finally {
      setIsSavingContacts(false);
    }
  };

  const setPrimaryContact = async (contactId: string) => {
    const updated = contacts.map((c) => ({
      ...c,
      isPrimary: c.id === contactId,
    }));
    await saveContacts(updated);
  };

  const addContact = async () => {
    if (!newContact.name.trim()) return;
    const shouldBePrimary = contacts.length === 0 || newContact.isPrimary;
    const created: JobContact = {
      id: `contact-${Date.now()}`,
      name: newContact.name.trim(),
      role: newContact.role.trim() || undefined,
      phone: newContact.phone.trim() || undefined,
      email: newContact.email.trim() || undefined,
      isPrimary: shouldBePrimary,
    };
    const updated = [
      ...contacts.map((c) => (shouldBePrimary ? { ...c, isPrimary: false } : c)),
      created,
    ];
    await saveContacts(updated);
    setNewContact({ name: '', role: '', phone: '', email: '', isPrimary: false });
    setShowAddContact(false);
  };

  const removeContact = async (contactId: string) => {
    const filtered = contacts.filter((c) => c.id !== contactId);
    if (filtered.length > 0 && !filtered.some((c) => c.isPrimary)) {
      filtered[0] = { ...filtered[0], isPrimary: true };
    }
    await saveContacts(filtered);
  };

  const addPmNote = async () => {
    if (!noteContent.trim()) return;
    setIsSavingNote(true);
    try {
      const entry: PmNoteEntry = {
        id: `note-${Date.now()}`,
        author: job?.project_manager || 'PM',
        category: noteCategory,
        content: noteContent.trim(),
        createdAt: new Date().toISOString(),
      };
      const updatedLog = [entry, ...pmNotesLog];
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pmNotesLog: updatedLog }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        setPmNotesLog(Array.isArray(data.job.pm_notes_log) ? data.job.pm_notes_log : updatedLog);
        setNoteContent('');
      }
    } finally {
      setIsSavingNote(false);
    }
  };

  const deletePmNote = async (noteId: string) => {
    const updatedLog = pmNotesLog.filter((n) => n.id !== noteId);
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pmNotesLog: updatedLog }),
    });
    const data = await res.json();
    if (res.ok && data.job) {
      setJob(data.job);
      setPmNotesLog(Array.isArray(data.job.pm_notes_log) ? data.job.pm_notes_log : updatedLog);
    }
  };

  const saveGeneralNotes = async () => {
    setIsSavingGeneralNotes(true);
    setGeneralNotesSavedMsg(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: generalNotes }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        setGeneralNotesSavedMsg('Saved');
        setTimeout(() => setGeneralNotesSavedMsg(null), 2500);
      }
    } finally {
      setIsSavingGeneralNotes(false);
    }
  };

  const loadInstallCalendar = async () => {
    try {
      const res = await fetch('/api/install-tickets');
      const data = await res.json();
      if (res.ok) {
        setCalendarSummary(data.calendarSummary || {});
        setDefaultDailyLimit(data.defaultDailyLimit ?? 3);
        const jobTickets = (data.tickets || []).filter((t: any) => t.job_id === jobId);
        setInstallTickets(jobTickets);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadJob();
    if (jobId) loadInstallCalendar();
  }, [jobId]);

  const toggleOpenDay = (day: string) => {
    setSiteOpenDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const selectedDayInfo = requestedInstallDate
    ? calendarSummary[requestedInstallDate]
    : undefined;
  const selectedDayConfirmed = selectedDayInfo?.confirmedCount ?? 0;
  const selectedDayLimit = selectedDayInfo?.limit ?? defaultDailyLimit;
  const isRequestedDayFull =
    Boolean(requestedInstallDate) && selectedDayConfirmed >= selectedDayLimit;

  const handleSaveSchedule = async (requestInstall: boolean) => {
    if (!jobId) return;
    setScheduleSavedMsg(null);
    setScheduleErrorMsg(null);

    if (requestInstall) {
      if (!requestedInstallDate) {
        setScheduleErrorMsg('Please select a Requested Install Date on the calendar.');
        return;
      }
      if ((isPriority || isRequestedDayFull) && !priorityReason.trim()) {
        setScheduleErrorMsg(
          isRequestedDayFull
            ? 'This day is at capacity. Please explain why this job must be scheduled on this day.'
            : 'Please provide a reason when flagging this ticket as Important / Priority.'
        );
        return;
      }
    }

    setIsSavingSchedule(true);
    try {
      if (!requestInstall) {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            materialEta: materialEta || null,
            siteAvailableRange: siteAvailableRange || null,
            requestedInstallDate: requestedInstallDate || null,
            installAvailabilityNotes: installAvailabilityNotes || null,
          }),
        });
        const data = await res.json();
        if (res.ok && data.job) {
          setJob(data.job);
          setScheduleSavedMsg('Material ETA & site availability notes saved.');
        }
      } else {
        const res = await fetch('/api/install-tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            materialEta: materialEta || null,
            siteAvailableRange: siteAvailableRange || null,
            siteOpenDays,
            workShift,
            requestedInstallDate,
            isPriority: isPriority || isRequestedDayFull,
            priorityReason: priorityReason.trim() || null,
            siteAccessNotes: installAvailabilityNotes || null,
            estimatedDurationDays: Number(estimatedDurationDays) || 1,
            crewSizeNeeded: crewSizeNeeded ? Number(crewSizeNeeded) : null,
            submittedBy: job?.project_manager || 'PM',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setScheduleErrorMsg(data.error || 'Failed to submit install ticket.');
          return;
        }
        setScheduleSavedMsg(
          'Installation ticket sent to the Install Department Dashboard!'
        );
        setPriorityReason('');
        setIsPriority(false);
        await Promise.all([loadJob(), loadInstallCalendar()]);
      }
    } finally {
      setIsSavingSchedule(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading job viewer...</div>;
  }

  if (!job) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-slate-600">Job not found.</p>
        <Link href="/pm" className="text-blue-700 font-bold underline text-sm">
          ← Back to PM Portal
        </Link>
      </div>
    );
  }

  const baseQuote = Number(job.quote_amount) || 0;
  const approvedAdditions = changeOrders
    .filter((c) => (c.status === 'approved' || c.status === 'billed') && c.type === 'addition')
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const approvedDeductions = changeOrders
    .filter((c) => (c.status === 'approved' || c.status === 'billed') && c.type === 'deduction')
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const adjustedTotal = baseQuote + approvedAdditions - approvedDeductions;
  const totalPoSpend = purchaseOrders
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + (Number(p.total_cost) || 0), 0);

  const lineItems = Array.isArray(job.line_items) ? job.line_items : [];
  const fullAddress = [
    job.address_street,
    [job.address_city, job.address_state].filter(Boolean).join(', '),
    job.address_zip,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-teal-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-teal-200">
            <Link href="/pm" className="hover:underline flex items-center gap-1 font-bold">
              <ArrowLeft className="w-3.5 h-3.5" /> PM Dashboard
            </Link>
            <span>•</span>
            <Link href="/jobs" className="hover:underline font-bold">
              All Jobs
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <span className="font-mono text-sm px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-200">
              {job.job_number || 'JOB'}
            </span>
            <span>{job.project_name}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/jobs/${job.id}/purchase-orders`}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <PackageCheck className="w-4 h-4" />
            <span>Purchase Orders ({purchaseOrders.length})</span>
          </Link>
          <Link
            href={`/jobs/${job.id}/change-orders`}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileDiff className="w-4 h-4" />
            <span>Change Orders ({changeOrders.length})</span>
          </Link>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Base Quote Amount</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            ${baseQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs bg-purple-50/30">
          <span className="text-[11px] font-bold text-purple-800 uppercase">Approved Change Orders</span>
          <div className="text-xl font-black text-purple-900 mt-1">
            {approvedAdditions - approvedDeductions >= 0 ? '+' : '-'}$
            {Math.abs(approvedAdditions - approvedDeductions).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/30">
          <span className="text-[11px] font-bold text-emerald-800 uppercase">Adjusted Contract Total</span>
          <div className="text-xl font-black text-emerald-900 mt-1 flex items-center gap-1">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            {adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/30">
          <span className="text-[11px] font-bold text-blue-800 uppercase">PO Material Spend</span>
          <div className="text-xl font-black text-blue-900 mt-1">
            ${totalPoSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main 2-column Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: POC, Site Info & Install Scheduling */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
            <h2 className="text-sm font-black text-slate-900">Point of Contact &amp; Site</h2>
            <div className="space-y-2 text-slate-600">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900">{job.client_company || 'No Contractor'}</div>
                  <div className="text-xs text-slate-500">
                    {contacts.length} contact{contacts.length === 1 ? '' : 's'} on job
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Points of Contact
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddContact((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showAddContact ? 'Cancel' : 'Add Contact'}
                  </button>
                </div>

                {showAddContact && (
                  <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 space-y-2">
                    <input
                      type="text"
                      placeholder="Contact Name *"
                      value={newContact.name}
                      onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Role (e.g. Site Super, Project Coordinator)"
                      value={newContact.role}
                      onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="tel"
                        placeholder="Phone"
                        value={newContact.phone}
                        onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={newContact.email}
                        onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newContact.isPrimary}
                        onChange={(e) => setNewContact({ ...newContact, isPrimary: e.target.checked })}
                      />
                      Set as Primary Contact
                    </label>
                    <button
                      type="button"
                      disabled={isSavingContacts || !newContact.name.trim()}
                      onClick={addContact}
                      className="w-full py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSavingContacts ? 'Saving...' : 'Save Contact'}
                    </button>
                  </div>
                )}

                {contacts.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No contacts added yet.</div>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                          contact.isPrimary
                            ? 'border-amber-300 bg-amber-50/50'
                            : 'border-slate-200 bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900">{contact.name}</span>
                              {contact.isPrimary && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[10px]">
                                  <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                  Primary
                                </span>
                              )}
                            </div>
                            {contact.role && (
                              <div className="text-[11px] text-slate-500">{contact.role}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!contact.isPrimary && (
                              <button
                                type="button"
                                disabled={isSavingContacts}
                                onClick={() => setPrimaryContact(contact.id)}
                                title="Set as Primary Contact"
                                className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800"
                              >
                                Set Primary
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isSavingContacts}
                              onClick={() => removeContact(contact.id)}
                              title="Remove contact"
                              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="flex items-center gap-1.5 text-blue-700 font-semibold hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" /> {contact.phone}
                          </a>
                        )}
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="flex items-center gap-1.5 text-blue-700 font-semibold hover:underline break-all"
                          >
                            <Mail className="w-3.5 h-3.5 shrink-0" /> {contact.email}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <span>{fullAddress || 'Address not specified'}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <UserCheck className="w-4 h-4 text-teal-600" />
                <span>
                  PM: <strong>{job.project_manager || 'Unassigned'}</strong> • Estimator:{' '}
                  <strong>{job.estimator_name || 'N/A'}</strong>
                </span>
              </div>
              {job.scope_pdf_filename && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Scope PDF: </span>
                  {job.scope_pdf_url ? (
                    <a href={job.scope_pdf_url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline truncate">
                      {job.scope_pdf_filename}
                    </a>
                  ) : (
                    <strong>{job.scope_pdf_filename}</strong>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Install Department Coordination */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-blue-600" />
                <span>Install Dept. Ticket</span>
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    job.install_request_status === 'confirmed' ||
                    job.install_request_status === 'scheduled'
                      ? 'bg-emerald-100 text-emerald-800'
                      : job.install_request_status === 'requested'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {job.install_request_status.replace('_', ' ')}
                </span>
                <Link
                  href="/install"
                  className="text-[11px] font-bold text-indigo-700 hover:underline"
                >
                  Install Board →
                </Link>
              </div>
            </div>

            {/* Active / Latest Ticket Summary */}
            {installTickets.length > 0 && (
              <div className="space-y-2">
                {installTickets.slice(0, 2).map((t) => (
                  <div
                    key={t.id}
                    className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                      t.status === 'confirmed'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>
                        {t.status === 'confirmed'
                          ? `Confirmed: ${t.confirmed_install_date || t.requested_install_date}`
                          : `Requested: ${t.requested_install_date}`}
                      </span>
                      <span className="uppercase text-[10px]">
                        {t.work_shift} • {t.status}
                      </span>
                    </div>
                    {t.assigned_crew && (
                      <div>
                        Crew: <strong>{t.assigned_crew}</strong>
                      </div>
                    )}
                    {t.install_dept_notes && (
                      <div className="italic">Install Dept: {t.install_dept_notes}</div>
                    )}
                    {t.is_priority && t.priority_reason && (
                      <div className="text-rose-800 font-semibold">
                        Priority Note: {t.priority_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {scheduleSavedMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{scheduleSavedMsg}</span>
              </div>
            )}

            {scheduleErrorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{scheduleErrorMsg}</span>
              </div>
            )}

            {/* Micro-View of Install Calendar */}
            <InstallCalendarMicroView
              calendarSummary={calendarSummary}
              defaultDailyLimit={defaultDailyLimit}
              selectedDate={requestedInstallDate}
              onSelectDate={(d) => setRequestedInstallDate(d)}
              compact={true}
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Material ETA
                </label>
                <input
                  type="date"
                  value={materialEta}
                  onChange={(e) => setMaterialEta(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Desired Install Date
                </label>
                <input
                  type="date"
                  value={requestedInstallDate}
                  onChange={(e) => setRequestedInstallDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            {/* Day or Night Work */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Work Shift
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Day', 'Night', 'Flexible'] as const).map((shift) => (
                  <button
                    key={shift}
                    type="button"
                    onClick={() => setWorkShift(shift)}
                    className={`py-1.5 px-2 rounded-lg border font-bold flex items-center justify-center gap-1 transition ${
                      workShift === shift
                        ? shift === 'Night'
                          ? 'bg-indigo-900 text-white border-indigo-900'
                          : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {shift === 'Day' && <Sun className="w-3 h-3" />}
                    {shift === 'Night' && <Moon className="w-3 h-3" />}
                    <span>{shift}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Site Open Days */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Days Site Is Open
              </label>
              <div className="flex flex-wrap gap-1">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => {
                  const active = siteOpenDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleOpenDay(d)}
                      className={`px-2 py-1 rounded-md border text-[11px] font-bold transition ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Est. Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={estimatedDurationDays}
                  onChange={(e) => setEstimatedDurationDays(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Site Available Window
                </label>
                <input
                  type="text"
                  placeholder="e.g. 11/24 - 12/05"
                  value={siteAvailableRange}
                  onChange={(e) => setSiteAvailableRange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            {/* Priority / Important Flag */}
            <div
              className={`p-2.5 rounded-xl border space-y-2 ${
                isPriority || isRequestedDayFull
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPriority || isRequestedDayFull}
                  disabled={isRequestedDayFull}
                  onChange={(e) => setIsPriority(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="font-bold text-slate-800 leading-tight">
                  Flag as Important / Priority Request
                  {isRequestedDayFull && (
                    <span className="block text-[10px] text-rose-700 font-semibold mt-0.5">
                      Selected day is full ({selectedDayConfirmed}/{selectedDayLimit}). A reason is
                      required so Install Dept can consider moving things around.
                    </span>
                  )}
                </span>
              </label>

              {(isPriority || isRequestedDayFull) && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-rose-700 mb-1">
                    Why Must Job Be Scheduled This Day? *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Explain deadline, GC penalty, inspection date, or site constraint..."
                    value={priorityReason}
                    onChange={(e) => setPriorityReason(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Site Availability &amp; Access Notes
              </label>
              <textarea
                rows={2}
                placeholder="e.g. GC requires 48hr notice, badge check-in at loading dock..."
                value={installAvailabilityNotes}
                onChange={(e) => setInstallAvailabilityNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isSavingSchedule}
                onClick={() => handleSaveSchedule(false)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-700"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={isSavingSchedule}
                onClick={() => handleSaveSchedule(true)}
                className={`px-3 py-2 rounded-xl text-white font-bold flex items-center justify-center gap-1 ${
                  isPriority || isRequestedDayFull
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Install Ticket</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Scope Line Items + PO & CO Snapshots */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Job Scope Line Items ({lineItems.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Selected scope items transferred from the won bid.
                </p>
              </div>
              <Link
                href={`/jobs/${job.id}/purchase-orders`}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
              >
                + Order Items (PO)
              </Link>
            </div>

            {lineItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No line items recorded on this job yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Qty</th>
                      <th className="py-2.5 px-4">Manufacturer / SKU</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((li: any, idx: number) => (
                      <tr key={li.id || idx}>
                        <td className="py-2.5 px-4 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold">{li.quantity}</td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          {[li.manufacturer, li.sku].filter(Boolean).join(' • ') || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800">{li.description}</td>
                        <td className="py-2.5 px-4 text-right font-semibold">
                          {li.unitPrice !== undefined && li.unitPrice !== null
                            ? `$${Number(li.unitPrice).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick PO & CO Summaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-blue-600" />
                  <span>Purchase Orders ({purchaseOrders.length})</span>
                </h3>
                <Link href={`/jobs/${job.id}/purchase-orders`} className="text-xs font-bold text-blue-700 hover:underline">
                  Manage POs →
                </Link>
              </div>
              {purchaseOrders.length === 0 ? (
                <p className="text-xs text-slate-400">No purchase orders created yet.</p>
              ) : (
                <div className="space-y-2">
                  {purchaseOrders.slice(0, 4).map((po) => (
                    <div key={po.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {po.po_number} • {po.vendor}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Status: <strong className="uppercase">{po.status}</strong>
                          {po.expected_delivery_date ? ` • ETA ${po.expected_delivery_date}` : ''}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900">
                        ${Number(po.total_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <FileDiff className="w-4 h-4 text-purple-600" />
                  <span>Change Orders ({changeOrders.length})</span>
                </h3>
                <Link href={`/jobs/${job.id}/change-orders`} className="text-xs font-bold text-purple-700 hover:underline">
                  Manage COs →
                </Link>
              </div>
              {changeOrders.length === 0 ? (
                <p className="text-xs text-slate-400">No change orders recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {changeOrders.slice(0, 4).map((co) => (
                    <div key={co.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {co.co_number} • {co.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {co.type === 'deduction' ? 'Refund / Credit' : 'Extra Work'} •{' '}
                          <strong className="uppercase">{co.status}</strong>
                        </div>
                      </div>
                      <div
                        className={`font-bold ${
                          co.type === 'deduction' ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {co.type === 'deduction' ? '-' : '+'}$
                        {Number(co.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PM Job Notes & POC Communication Log */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4 text-teal-600" />
                  PM Notes &amp; POC Communication Log
                </h2>
                <span className="text-xs text-slate-500">
                  {pmNotesLog.length} entr{pmNotesLog.length === 1 ? 'y' : 'ies'}
                </span>
              </div>

              {/* Add Log Entry */}
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Type:</span>
                  {(
                    [
                      { value: 'poc_comm', label: 'POC Communication' },
                      { value: 'pm_note', label: 'PM Note' },
                      { value: 'site_update', label: 'Site Update' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNoteCategory(opt.value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        noteCategory === opt.value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  placeholder="Log a call/email with the Point of Contact, or jot down a note about this job..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isSavingNote || !noteContent.trim()}
                    onClick={addPmNote}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    {isSavingNote ? 'Adding...' : 'Add Entry'}
                  </button>
                </div>
              </div>

              {/* Log Entries */}
              {pmNotesLog.length === 0 ? (
                <div className="text-sm text-slate-500 italic py-2">
                  No communication logs or PM notes recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {pmNotesLog.map((entry) => {
                    const badgeStyle =
                      entry.category === 'poc_comm'
                        ? 'bg-blue-100 text-blue-800'
                        : entry.category === 'site_update'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700';
                    const badgeLabel =
                      entry.category === 'poc_comm'
                        ? 'POC Communication'
                        : entry.category === 'site_update'
                        ? 'Site Update'
                        : 'PM Note';
                    return (
                      <div
                        key={entry.id}
                        className="p-3 rounded-lg border border-slate-200 bg-white space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle}`}
                            >
                              {badgeLabel}
                            </span>
                            <span className="text-xs font-semibold text-slate-700">
                              {entry.author}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => deletePmNote(entry.id)}
                            title="Delete entry"
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">
                          {entry.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General Job Notes */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                    Pinned General Job Notes
                  </label>
                  {generalNotesSavedMsg && (
                    <span className="text-xs font-semibold text-emerald-600">
                      {generalNotesSavedMsg}
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  placeholder="Persistent general notes, gate codes, special instructions..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isSavingGeneralNotes}
                    onClick={saveGeneralNotes}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50"
                  >
                    {isSavingGeneralNotes ? 'Saving...' : 'Save General Notes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
