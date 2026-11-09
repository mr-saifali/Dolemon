# Doremon: contextual answers, privacy and token controls

## Why replies were generic

The previous transport replaced the actual question and all excerpts/history
with intent labels and partial counts. The server prompt explicitly told the
model it could not see the question, and a local “you said” shortcut repeated
old answers instead of handling follow-ups. Persona edits could not fix that
missing information. The new opt-in path passes useful, bounded context.

## What goes to the provider

Only after the user allows that request in the in-app sharing dialog:

- Actual question, capped at 1,200 UTF-8 bytes.
- Up to 16 selected excerpts from up to 50 loaded rows. The latest eight are
  favored; up to eight older keyword-relevant excerpts can be included.
  Each excerpt is at most 500 bytes; a shared 6,000-byte content budget can
  reduce that count further. Roles are `me` / `them`, not account handles.
- Up to three previous Q&A exchanges (200-byte question / 400-byte answer).
- An optional 600-byte **unverified** saved summary, subordinate to direct evidence.
- Action and `incomplete: true`. The serialized context is at most 9,000 bytes,
  enforced again by the server. This is a byte budget, not a fixed token count.

Attachments, media objects/URLs, participant-ID fields, account-name fields and
full archives are not sent. **Text itself can still contain names, secrets or
links. It is not anonymized or end-to-end encrypted to the AI provider.** The
notice asks users to obtain the other participant's permission. It does not
verify that permission, guarantee confidentiality or override provider policy.
Paying for API access does not by itself prove any particular retention/training
policy. Confirm the policy for the actual API project/account.

Legacy requests without `sharing: conversation-v1` still strip free text.
The API key remains server-only; no key, billing tier or model was changed here.

## Useful flow without background spending

- No AI requests on room opening, typing or every incoming message. Automatic
  optional memory bookkeeping and finalization stay local.
- Room requests refresh the recent DB window with a four-second bounded wait,
  otherwise using the already loaded partial window. There is no automatic full
  archive fetch. Summaries must acknowledge missing context when relevant.
- Deliberate questions use one generation; a 503 may retry the same model once.
  No model fallback, retry on timeout/quota/key errors or hidden summarizer call.
- Replies have a 512 output-token cap. Input token cost still varies by language
  and tokenizer; the byte budget is not a promise of a particular bill.
- In-app request guards stop double-submit; the server rejects concurrent
  same-account requests and has a best-effort 12/minute **per-instance** limit.
  Serverless instances/restarts do not share this memory. Set provider-side
  project quotas/budget alerts for a durable global cost limit; none were changed.
- Generic follow-ups go to the model with prior Q&A, not an automatic repeated
  answer. Only explicit repeat requests and explicit local keyword search bypass AI.

## Storage and verification

New room Q&A still stores five exchanges unencrypted on this device, scoped by
account/conversation; prior server memory can remain until explicitly deleted.
Excerpts/notes are untrusted input, kept in a data payload rather than elevated
into system instructions. This reduces prompt-injection risk but is not a
formal safety guarantee or security audit. The assistant has no external-action
tools in this endpoint.

Unit/API tests mock the provider and verify transport, limits, context isolation,
errors and authentication. They do not validate the user's paid billing setup
or real response quality. Browser smoke checks exercise menu routes, panels and
sharing dialog with local demo data; Android hardware/WebView testing remains needed.
