"use client";

import { useEffect, useRef, useState } from "react";
import { functions } from "@/lib/appwrite/client";
import { appwriteConfig } from "@/lib/appwrite/config";
import { createLeadEmailSender, emailFailureMessage, validateLeadEmail } from "@/lib/admin/lead-email";
import type { Lead } from "@/lib/admin/types";
import { useAdminAuth } from "./AdminAuthProvider";
import { useLeads } from "./LeadsProvider";
import AdminIcon from "./AdminIcon";
import styles from "@/app/admin/admin.module.css";

const send = createLeadEmailSender({ functions, config: appwriteConfig });

export default function LeadEmailPanel({ lead }: { lead: Lead }) {
  const { state: auth } = useAdminAuth();
  const { reportEmailSessionFailure, getMutationState } = useLeads();
  const userId = auth.status === "authorized" ? auth.user.$id : "";
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [copyErrors, setCopyErrors] = useState<Partial<Record<"cc" | "bcc", string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false), generation = useRef(0);
  const identity = useRef({ userId, leadId: lead.id, archived: Boolean(lead.deletedAt) });
  identity.current = { userId, leadId: lead.id, archived: Boolean(lead.deletedAt) };
  useEffect(() => {
    generation.current++; lock.current = false;
    setSubject(""); setMessage(""); setCc(""); setBcc(""); setCopyErrors({}); setStatus("idle"); setFeedback("");
    return () => { generation.current++; };
  }, [userId, lead.id]);
  const pendingMutation = getMutationState(lead.id).pending;
  const disabled = status === "sending" || pendingMutation || !userId;
  const edit = (field?: "cc" | "bcc") => { setStatus("idle"); setFeedback(""); if (field) setCopyErrors(previous => ({ ...previous, [field]: undefined })); };
  const submit = async () => {
    if (lock.current || disabled || lead.deletedAt || identity.current.userId !== userId || identity.current.leadId !== lead.id) return;
    const validated = validateLeadEmail(lead.id, subject, message, cc, bcc);
    if (!validated.ok) {
      setStatus("error"); setCopyErrors(validated.field ? { [validated.field]: validated.message } : {});
      setFeedback(validated.field ? "" : validated.message); return;
    }
    lock.current = true; setStatus("sending"); setFeedback(""); setCopyErrors({});
    const lifetime = generation.current, owner = userId, leadId = lead.id;
    const current = () => generation.current === lifetime && identity.current.userId === owner &&
      identity.current.leadId === leadId && !identity.current.archived;
    try {
      const result = await send(leadId, subject, message, cc, bcc);
      if (!current()) return;
      if (!result.ok && result.kind === "session") { await reportEmailSessionFailure(); return; }
      if (result.ok) { setSubject(""); setMessage(""); setCc(""); setBcc(""); setCopyErrors({}); setStatus("sent"); setFeedback("Email sent successfully."); }
      else { setStatus("error"); setFeedback(emailFailureMessage); }
    } catch {
      if (current()) { setStatus("error"); setFeedback(emailFailureMessage); }
    } finally {
      if (current()) { lock.current = false; setStatus(previous => previous === "sending" ? "error" : previous); }
    }
  };
  if (lead.deletedAt || !userId) return null;
  return <section className={styles.detailSection} aria-labelledby="send-email-title">
    <h2 id="send-email-title" className={styles.detailSectionTitle}><AdminIcon name="mail" size={16} />Send Email</h2>
    <form className={styles.emailPanel} aria-busy={status === "sending"} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <p className={styles.fieldLabel}>To</p><p className={styles.emailRecipient}>{lead.email}</p>
      <label htmlFor="lead-email-cc" className={styles.fieldLabel}>CC (optional)</label>
      <input id="lead-email-cc" className={styles.emailInput} inputMode="email" maxLength={3000}  value={cc} disabled={disabled} aria-invalid={Boolean(copyErrors.cc)} aria-describedby={copyErrors.cc ? "lead-email-cc-error" : undefined} onChange={event => { setCc(event.target.value); edit("cc"); }} />
      {copyErrors.cc && <p id="lead-email-cc-error" className={styles.mutationError} role="alert">{copyErrors.cc}</p>}
      <label htmlFor="lead-email-bcc" className={styles.fieldLabel}>BCC (optional)</label>
      <input id="lead-email-bcc" className={styles.emailInput} inputMode="email" maxLength={3000}  value={bcc} disabled={disabled} aria-invalid={Boolean(copyErrors.bcc)} aria-describedby={copyErrors.bcc ? "lead-email-bcc-error" : undefined} onChange={event => { setBcc(event.target.value); edit("bcc"); }} />
      {copyErrors.bcc && <p id="lead-email-bcc-error" className={styles.mutationError} role="alert">{copyErrors.bcc}</p>}
      <label htmlFor="lead-email-subject" className={styles.fieldLabel}>Subject</label>
      <input id="lead-email-subject" className={styles.emailInput} required maxLength={200} value={subject} disabled={disabled} onChange={event => { setSubject(event.target.value); edit(); }} />
      <label htmlFor="lead-email-message" className={styles.fieldLabel}>Message</label>
      <textarea id="lead-email-message" className={styles.emailInput + " " + styles.emailMessage} required maxLength={10000} value={message} disabled={disabled} onChange={event => { setMessage(event.target.value); edit(); }} />
      <div className={styles.noteActions}><button type="submit" className={styles.primaryButton} disabled={disabled}>{status === "sending" ? "Sending..." : status === "sent" ? "Sent" : "Send Email"}</button></div>
      {feedback && <p className={status === "sent" ? styles.feedback : styles.mutationError} role={status === "sent" ? "status" : "alert"} aria-live="polite">{feedback}</p>}
    </form>
  </section>;
}
