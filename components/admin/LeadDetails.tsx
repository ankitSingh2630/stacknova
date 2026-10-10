"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AdminIcon from "./AdminIcon";
import { useLeads } from "./LeadsProvider";
import LeadsState from "./LeadsState";
import { dateLabel } from "@/lib/admin/format";
import { validLeadId } from "@/lib/admin/leads";
import { leadStatuses, type Lead } from "@/lib/admin/types";
import styles from "@/app/admin/admin.module.css";

export default function LeadDetails() {
  // This hook is intentionally below the route's Suspense boundary.
  const params = useSearchParams();
  const { getLeadState, ensureLead, ready } = useLeads();
  const id = params.get("id");
  useEffect(() => { if (ready && id && validLeadId(id)) void ensureLead(id); }, [id, ensureLead, ready]);
  const detail = id && validLeadId(id) ? getLeadState(id) : { status: "notFound" as const };
  if (detail.status === "loading" || detail.status === "error") return <main className={styles.page}><LeadsState loading={detail.status === "loading"} error={detail.status === "error" ? detail.message : ""} onRetry={async () => { if (id) await ensureLead(id, true); }} /></main>;
  if (detail.status === "notFound") return <main className={styles.page}><div className={styles.empty}><h1>{id ? "Lead unavailable" : "Choose a lead"}</h1><p>{id ? "This lead could not be found or is no longer available." : "Open a lead from the incoming pipeline to view its details."}</p><Link href="/admin/leads/" className={styles.primaryButton}>Back to Leads</Link></div></main>;
  return <LeadDetailContent key={detail.lead.id} lead={detail.lead} />;
}

function LeadDetailContent({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { getMutationState, updateLeadStatus, addLeadNote, softDeleteLead } = useLeads();
  const mutation = getMutationState(lead.id);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const archiveButton = useRef<HTMLButtonElement>(null);
  const [feedback, setFeedback] = useState("");
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(lead.email); setFeedback("Email address copied."); }
    catch { setFeedback("Copy unavailable. Select and copy the email address above."); }
  };
  const archive = async () => {
    if (await softDeleteLead(lead.id)) router.replace("/admin/leads/");
  };
  const saveNote = async () => {
    if (!draft.trim() || mutation.pending) return;
    if (await addLeadNote(lead.id, draft)) setDraft("");
  };
  const closeDialog = () => { dialog.current?.close(); setConfirming(false); archiveButton.current?.focus(); };
  return <main className={styles.page + " " + styles.detailPage}>
    <Link href="/admin/leads/" className={styles.backLink}><AdminIcon name="back" size={16} />Back to Leads</Link>
    <section className={styles.detailHero} aria-labelledby="lead-name">
      <div className={styles.detailHeroTop}><span>ID: #{lead.id}</span><span className={styles.live}><span className={styles.dot} />{lead.status === "Closed" ? "Closed Enquiry" : "Active Inbound"}</span></div>
      <h1 id="lead-name">{lead.name}</h1><p className={styles.secondary}>{lead.service} enquiry</p>
      <div className={styles.statusControl}><label htmlFor="lead-status">Pipeline Status{mutation.pending && mutation.operation === "status" && <span role="status"> · Saving status…</span>}</label><select id="lead-status" value={lead.status} disabled={mutation.pending} onChange={event => void updateLeadStatus(lead.id, event.target.value)}>{leadStatuses.map(status => <option key={status}>{status}</option>)}</select></div>
    </section>
    <div className={styles.detailColumns}>
      <div>
        <section className={styles.detailSection} aria-labelledby="contact-info"><h2 id="contact-info" className={styles.detailSectionTitle}><AdminIcon name="leads" size={16} />Contact Information</h2><div className={styles.panel}>
          <div className={styles.contactLine}><div><p className={styles.fieldLabel}>Email Address</p><p className={styles.fieldValue}>{lead.email}</p></div><div className={styles.contactActions}><button className={styles.iconButton} aria-label="Copy email address" onClick={copyEmail}><AdminIcon name="copy" size={16} /></button><a href={"mailto:" + lead.email} className={styles.iconButton} aria-label={"Email " + lead.name}><AdminIcon name="mail" size={16} /></a></div></div>
          <div className={styles.contactLine}><div><p className={styles.fieldLabel}>Phone Number</p><p className={styles.fieldValue}>{lead.phone}</p></div><a href={"tel:" + lead.phone.replace(/[^+0-9]/g, "")} className={styles.primaryButton} aria-label={"Call " + lead.name}><AdminIcon name="phone" size={16} /></a></div>
          <div className={styles.contactLine}><div><p className={styles.fieldLabel}>Company</p><p className={styles.fieldValue}>{lead.company || "Not provided"}</p></div><AdminIcon name="building" style={{ color: "#3d494c" }} /></div>
        </div></section>
        <section className={styles.detailSection} aria-labelledby="enquiry-info"><h2 id="enquiry-info" className={styles.detailSectionTitle}><AdminIcon name="globe" size={16} />Enquiry Information</h2><dl className={styles.panel}>
          <div className={styles.infoLine}><dt>Target Service</dt><dd className={styles.serviceTag}>{lead.service}</dd></div>
          <div className={styles.infoLine}><dt>Lead Source</dt><dd><AdminIcon name="globe" size={14} style={{ color: "#4cd7f6" }} />{lead.source}</dd></div>
          <div className={styles.infoLine}><dt>Submitted Date</dt><dd><time dateTime={lead.createdAt}>{dateLabel(lead.createdAt, true)}</time></dd></div>
          <div className={styles.infoLine}><dt>Updated Date</dt><dd><time dateTime={lead.updatedAt}>{dateLabel(lead.updatedAt, true)}</time></dd></div>
        </dl></section>
        <section className={styles.detailSection} aria-labelledby="project-description"><h2 id="project-description" className={styles.detailSectionTitle}><AdminIcon name="file" size={16} />Project Description</h2><div className={styles.panel}><blockquote className={styles.quote}>{lead.message}</blockquote><p className={styles.quoteFoot}><AdminIcon name="clock" size={12} />Original message from intake</p></div></section>
      </div>
      <section className={styles.detailSection} aria-labelledby="private-notes"><h2 id="private-notes" className={styles.detailSectionTitle}><AdminIcon name="lock" size={16} />Private Notes</h2><div className={styles.notesPanel}>
        {lead.notes.trim() ? <p className={styles.noteText}>{lead.notes}</p> : <p className={styles.secondary}>No notes recorded.</p>}
        <form aria-busy={mutation.pending && mutation.operation === "notes"} onSubmit={event => { event.preventDefault(); void saveNote(); }}>
          <label htmlFor="private-note" className={styles.fieldLabel}>Add a note</label><textarea id="private-note" className={styles.noteInput} placeholder="Add a note" value={draft} disabled={mutation.pending} onChange={event => setDraft(event.target.value)} /><div className={styles.noteActions}><button type="submit" className={styles.secondaryButton} disabled={mutation.pending || !draft.trim()}><AdminIcon name="note" size={14} />{mutation.pending && mutation.operation === "notes" ? "Saving note…" : "Save Note"}</button></div>
        </form>
      </div></section>
    </div>
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    {mutation.message && <p className={mutation.success ? styles.feedback : styles.mutationError} role={mutation.success ? "status" : "alert"} aria-live="polite">{mutation.message}</p>}
    <div className={styles.deleteArea}><button ref={archiveButton} className={styles.dangerButton} disabled={mutation.pending} onClick={() => { setConfirming(true); dialog.current?.showModal(); }}><AdminIcon name="trash" />Archive Lead</button><p>Remove this lead from active leads. The stored record will be retained.</p></div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="archive-title" aria-describedby="archive-description" onCancel={event => { if (mutation.pending) event.preventDefault(); else setConfirming(false); }} onClose={() => { setConfirming(false); archiveButton.current?.focus(); }}>
      <h2 id="archive-title">Archive this lead?</h2><p id="archive-description">Remove {lead.name} from active leads? This does not permanently delete the record.</p>
      {confirming && mutation.message && !mutation.success && <p className={styles.mutationError} role="alert">{mutation.message}</p>}
      <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={mutation.pending} onClick={closeDialog}>Cancel</button><button type="button" className={styles.dangerButton} disabled={mutation.pending} onClick={() => void archive()}>{mutation.pending && mutation.operation === "archive" ? "Archiving…" : "Archive Lead"}</button></div>
    </dialog>
  </main>;
}
