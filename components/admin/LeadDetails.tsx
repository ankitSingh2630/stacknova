"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import AdminIcon from "./AdminIcon";
import { useMockLeads } from "./MockLeadsProvider";
import { dateLabel, noteDateLabel } from "@/lib/admin/mock-data";
import { leadStatuses, type Lead, type LeadStatus } from "@/lib/admin/types";
import styles from "@/app/admin/admin.module.css";

export default function LeadDetails() {
  // This hook is intentionally below the route's Suspense boundary.
  const params = useSearchParams();
  const { leads } = useMockLeads();
  const id = params.get("id");
  const lead = leads.find(item => item.id === id);
  if (!lead) return <main className={styles.page}><div className={styles.empty}><h1>{id ? "Lead unavailable" : "Choose a lead"}</h1><p>{id ? "This demo lead does not exist or has been removed from the current preview." : "Open a lead from the incoming pipeline to view its details."}</p><Link href="/admin/leads/" className={styles.primaryButton}>Back to Leads</Link></div></main>;
  return <LeadDetailContent key={lead.id} lead={lead} />;
}

function LeadDetailContent({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { updateStatus, addNote, deleteLead } = useMockLeads();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(lead.email); setFeedback("Email address copied."); }
    catch { setFeedback("Copy unavailable. Select and copy the email address above."); }
  };
  const closeDialog = () => { dialog.current?.close(); deleteButton.current?.focus(); };
  return <main className={styles.page + " " + styles.detailPage}>
    <Link href="/admin/leads/" className={styles.backLink}><AdminIcon name="back" size={16} />Back to Leads</Link>
    <section className={styles.detailHero} aria-labelledby="lead-name">
      <div className={styles.detailHeroTop}><span>ID: #{lead.id}</span><span className={styles.live}><span className={styles.dot} />{lead.status === "Closed" ? "Closed Enquiry" : "Active Inbound"}</span></div>
      <h1 id="lead-name">{lead.name}</h1><p className={styles.secondary}>{lead.service} enquiry</p>
      <div className={styles.statusControl}><label htmlFor="lead-status">Pipeline Status</label><select id="lead-status" value={lead.status} onChange={event => { updateStatus(lead.id, event.target.value as LeadStatus); setFeedback("Pipeline status updated in this demo."); }}>{leadStatuses.map(status => <option key={status}>{status}</option>)}</select></div>
    </section>
    <div className={styles.detailColumns}>
      <div>
        <section className={styles.detailSection} aria-labelledby="contact-info"><h2 id="contact-info" className={styles.detailSectionTitle}><AdminIcon name="leads" size={16} />Contact Information</h2><div className={styles.panel}>
          <div className={styles.contactLine}><div><p className={styles.fieldLabel}>Email Address</p><p className={styles.fieldValue}>{lead.email}</p></div><div className={styles.contactActions}><button className={styles.iconButton} aria-label="Copy email address" onClick={copyEmail}><AdminIcon name="copy" size={16} /></button><a href={"mailto:" + lead.email} className={styles.iconButton} aria-label={"Email " + lead.name}><AdminIcon name="mail" size={16} /></a></div></div>
          <div className={styles.contactLine}><div><p className={styles.fieldLabel}>Phone Number</p><p className={styles.fieldValue}>{lead.phone}</p></div><a href={"tel:" + lead.phone.replace(/[^+0-9]/g, "")} className={styles.primaryButton} aria-label={"Call " + lead.name}><AdminIcon name="phone" size={16} /></a></div>
          <div className={styles.contactLine}><div><p className={styles.fieldLabel}>Company</p><p className={styles.fieldValue}>{lead.company}</p></div><AdminIcon name="building" style={{ color: "#3d494c" }} /></div>
        </div></section>
        <section className={styles.detailSection} aria-labelledby="enquiry-info"><h2 id="enquiry-info" className={styles.detailSectionTitle}><AdminIcon name="globe" size={16} />Enquiry Information</h2><dl className={styles.panel}>
          <div className={styles.infoLine}><dt>Target Service</dt><dd className={styles.serviceTag}>{lead.service}</dd></div>
          <div className={styles.infoLine}><dt>Lead Source</dt><dd><AdminIcon name="globe" size={14} style={{ color: "#4cd7f6" }} />{lead.source}</dd></div>
          <div className={styles.infoLine}><dt>Submitted Date</dt><dd><time dateTime={lead.submittedAt}>{dateLabel(lead.submittedAt, true)}</time></dd></div>
        </dl></section>
        <section className={styles.detailSection} aria-labelledby="project-description"><h2 id="project-description" className={styles.detailSectionTitle}><AdminIcon name="file" size={16} />Project Description</h2><div className={styles.panel}><blockquote className={styles.quote}>“{lead.description}”</blockquote><p className={styles.quoteFoot}><AdminIcon name="clock" size={12} />Original scope summary from intake</p></div></section>
      </div>
      <section className={styles.detailSection} aria-labelledby="private-notes"><h2 id="private-notes" className={styles.detailSectionTitle}><AdminIcon name="lock" size={16} />Private Notes<span className={styles.count}>{lead.notes.length} logs</span></h2><div className={styles.notesPanel}>
        <form onSubmit={event => { event.preventDefault(); if (!note.trim()) return; addNote(lead.id, note); setNote(""); setFeedback("Note added in this demo."); }}><label htmlFor="private-note" className="sr-only">Add a private note</label><textarea id="private-note" className={styles.noteInput} placeholder="Add a private note regarding client interaction…" value={note} maxLength={2000} onChange={event => setNote(event.target.value)} /><div className={styles.noteActions}><button type="submit" className={styles.secondaryButton} disabled={!note.trim()}><AdminIcon name="note" size={14} style={{ color: "#4cd7f6" }} />Add Note</button></div></form>
        {lead.notes.map(item => <article className={styles.note} key={item.id}><div className={styles.noteHeader}><strong><AdminIcon name={item.title === "System Event" ? "bolt" : item.title === "Outbound Call" ? "phone" : "note"} size={13} />{item.title}</strong><time dateTime={item.createdAt}>{noteDateLabel(item.createdAt)}</time></div><p>{item.text}</p></article>)}
        {!lead.notes.length && <p className={styles.secondary}>No notes yet. Add the first interaction above.</p>}
      </div></section>
    </div>
    <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>
    <div className={styles.deleteArea}><button ref={deleteButton} className={styles.dangerButton} onClick={() => dialog.current?.showModal()}><AdminIcon name="trash" />Delete Lead</button><p>Deleting removes this record from current active pipeline boards.</p></div>
    <p className={styles.demoHint}>UI demo · Notes and changes exist only in memory and reset on reload.</p>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-title" aria-describedby="delete-description" onClose={() => deleteButton.current?.focus()}><h2 id="delete-title">Delete this lead?</h2><p id="delete-description">Remove {lead.name} and their notes from the current demo? Reloading restores the mock data.</p><div className={styles.dialogActions}><button autoFocus className={styles.secondaryButton} onClick={closeDialog}>Cancel</button><button className={styles.dangerButton} onClick={() => { dialog.current?.close(); deleteLead(lead.id); router.push("/admin/leads/"); }}>Delete Lead</button></div></dialog>
  </main>;
}
