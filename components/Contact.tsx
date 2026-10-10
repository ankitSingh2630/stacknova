"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { enquiryLimits, enquiryServices, submitEnquiry, validateEnquiry } from "@/lib/enquiry";
import type { EnquiryErrors, EnquiryPayload, EnquiryResponse } from "@/lib/enquiry";
const budgets = ["< ₹1L", "₹1L – ₹5L", "₹5L – ₹15L", "₹15L+", "Not sure yet"];
const budgetSuffix = (budget: string) => budget ? `\n\nBudget: ${budget}` : "";

function readEnquiry(form: HTMLFormElement): EnquiryPayload {
  const data = new FormData(form);
  const get = (field: string) => String(data.get(field) || "");
  const message = get("message");
  return {
    name: get("name"), email: get("email"), phone: get("phone"),
    company: get("company"), service: get("service"),
    // Budget never satisfies the independently required project message.
    message: message.trim() ? message + budgetSuffix(get("budget")) : "",
  };
}

export default function Contact() {
  const reduce = useReducedMotion();
  const submittingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [messageMaxLength, setMessageMaxLength] = useState<number>(enquiryLimits.message);
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [result, setResult] = useState<EnquiryResponse | null>(null);

  const errorFor = (field: keyof EnquiryPayload) => errors[field] ? (
    <span id={`enquiry-${field}-error`} className="text-xs text-red-300">{errors[field]}</span>
  ) : null;

  const handleChange = (e: React.FormEvent<HTMLFormElement>) => {
    const field = e.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
    const payload = readEnquiry(e.currentTarget);
    const validationErrors = validateEnquiry(payload);
    const changedField = field.name === "budget" ? "message" : field.name as keyof EnquiryPayload;
    if (field.name === "budget") {
      setMessageMaxLength(enquiryLimits.message - budgetSuffix(field.value).length);
    }
    setErrors((previous) => {
      // Recheck only this field. Budget changes can introduce a combined-length error;
      // keep the entered message intact and let the user shorten it or remove the budget.
      if (!previous[changedField] && !(field.name === "budget" && payload.message.length > enquiryLimits.message)) return previous;
      const next = { ...previous };
      if (validationErrors[changedField]) next[changedField] = validationErrors[changedField];
      else delete next[changedField];
      return next;
    });
    setResult((previous) => previous?.success ? previous : null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const form = e.currentTarget;
    const payload = readEnquiry(form);
    const validationErrors = validateEnquiry(payload);
    setErrors(validationErrors);
    setResult(null);
    const firstError = Object.keys(validationErrors)[0];
    if (firstError) {
      const field = form.elements.namedItem(firstError);
      // Wait for the error descriptions and aria-invalid state to render before focus.
      if (field instanceof HTMLElement) requestAnimationFrame(() => field.focus());
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await submitEnquiry(payload);
      setResult(response);
      if (response.success) {
        form.reset();
        setErrors({});
        setMessageMaxLength(enquiryLimits.message);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="relative border-t border-line">
      <div className="section grid gap-16 lg:grid-cols-[1fr_1.2fr] lg:gap-24">
        {/* left */}
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
        >
          <span className="eyebrow">Contact</span>
          <h2 className="display mt-6 text-4xl md:text-5xl lg:text-6xl">
            Let&apos;s build something <span className="text-accent-cyan">meaningful.</span>
          </h2>

          <dl className="mt-12 space-y-6 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Company</dt>
              <dd className="mt-1 text-base text-ink">StackNova Technologies</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Email</dt>
              <dd className="mt-1">
                <a href="mailto:hello@stacknova.in" className="text-base text-ink transition-colors hover:text-accent-cyan">
                    hello@stacknova.in
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Phone</dt>
              <dd>
                <a href="tel:+917980114950" className="text-base text-ink transition-colors hover:text-accent-cyan">
                  +91 79801 14950
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Location</dt>
              <dd className="mt-1 text-base text-ink">Delhi, India</dd>
            </div>
          </dl>

          <a href="#enquiry-form" onClick={() => nameRef.current?.focus()} className="btn-primary mt-10">
            Start a Project
          </a>
        </motion.div>

        {/* form */}
        <motion.form
          id="enquiry-form"
          noValidate
          aria-busy={submitting}
          initial={reduce ? undefined : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.1 }}
          onSubmit={handleSubmit}
          onChange={handleChange}
          className="grid gap-5 rounded-lg border border-line bg-white/[0.02] p-8 md:grid-cols-2 md:p-10"
        >
          <label className="flex flex-col gap-2 text-sm text-muted">
            Name
            <input ref={nameRef} required name="name" autoComplete="name" maxLength={enquiryLimits.name} disabled={submitting} aria-invalid={!!errors.name} aria-describedby={errors.name ? "enquiry-name-error" : undefined} className="field" placeholder="Your name" />
            {errorFor("name")}
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Email
            <input required type="email" name="email" autoComplete="email" maxLength={enquiryLimits.email} disabled={submitting} aria-invalid={!!errors.email} aria-describedby={errors.email ? "enquiry-email-error" : undefined} className="field" placeholder="you@company.com" />
            {errorFor("email")}
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Phone
            <input required type="tel" name="phone" autoComplete="tel" maxLength={enquiryLimits.phone} disabled={submitting} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "enquiry-phone-error" : undefined} className="field" placeholder="+91 98765 43210" />
            {errorFor("phone")}
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Company
            <input name="company" autoComplete="organization" maxLength={enquiryLimits.company} disabled={submitting} aria-invalid={!!errors.company} aria-describedby={errors.company ? "enquiry-company-error" : undefined} className="field" placeholder="Company name (optional)" />
            {errorFor("company")}
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted md:col-span-2">
            Project Type
            <select required name="service" disabled={submitting} aria-invalid={!!errors.service} aria-describedby={errors.service ? "enquiry-service-error" : undefined} className="field" defaultValue="">
              <option value="" disabled>
                Select a type
              </option>
              {enquiryServices.map((t) => (
                <option key={t} value={t} className="bg-navy-900">
                  {t}
                </option>
              ))}
            </select>
            {errorFor("service")}
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted md:col-span-2">
            Budget (optional)
            <select name="budget" disabled={submitting} className="field" defaultValue="">
              <option value="">
                Estimated budget
              </option>
              {budgets.map((b) => (
                <option key={b} value={b} className="bg-navy-900">
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted md:col-span-2">
            Message
            <textarea
              required
              name="message"
              maxLength={messageMaxLength}
              disabled={submitting}
              aria-invalid={!!errors.message}
              aria-describedby={errors.message ? "enquiry-message-limit enquiry-message-error" : "enquiry-message-limit"}
              rows={5}
              className="field resize-y"
              placeholder="Tell us about your project, goals and timeline…"
            />
            <span id="enquiry-message-limit" className="text-xs text-muted">Up to {messageMaxLength.toLocaleString("en-IN")} characters{messageMaxLength < enquiryLimits.message ? " with this budget selected" : ""}.</span>
            {errorFor("message")}
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:cursor-wait disabled:opacity-60 md:w-auto">
              {submitting ? "Submitting…" : "Send Project Inquiry"}
            </button>
            <p role="status" aria-live="polite" aria-atomic="true" className={`mt-4 text-sm ${result?.success ? "text-accent-cyan" : result ? "text-red-300" : "text-muted"}`}>
              {submitting ? "Submitting your enquiry. Please wait." : result?.message || ""}
            </p>
            <p className="mt-4 text-xs text-muted">We respond to every inquiry within one business day.</p>
          </div>
        </motion.form>
      </div>
    </section>
  );
}
