# constraints/

Legacy constraints, business rules, compliance requirements — facts that bound future
design choices but aren't decisions themselves.

Examples:
- "User sessions must not exceed 15 min due to finance compliance" → one file
- "Legacy OAuth flow must remain for 6 months during SSO migration" → one file

Files: `harness_<slug>.md` (harness-owned) or `<your-slug>.md` (human-owned).
No date required — constraints often persist longer than cases.
