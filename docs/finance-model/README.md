# Finance Model — UMC Organizational Framework (updated)

Clarification: the previous commit focused primarily on sections. This update specifies the behavior and allowed actors for the main church, organizations, and sections.

Rules implemented in code
- Main church:
  - Receiving: FinanceCommittee members and ChurchAdmin
  - Confirmation: ChiefRecordingSecretary
  - Treasurer: processes funds after confirmation
- Organizations:
  - Receiving & confirmation: Treasurer is primary
  - POS: FinanceCommittee members in organizations may operate POS; POSOperator role allowed too
- Sections:
  - Follow organization rules (Treasurer primary). Treasurers and POSOperators may operate POS in sections; FinanceCommittee POS is allowed only for organizations per rules.

If you'd like different exceptions (e.g., allow Organization FinanceCommittee to receive small cash amounts), tell me and I will adjust the helpers and tests.
