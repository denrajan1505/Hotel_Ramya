import MilestoneStatusPage from '../shared/MilestoneStatusPage';

export default function Escalation() {
  return (
    <MilestoneStatusPage
      title="Escalation"
      subtitle="Escalation tracking for every bill — not payment or approval status"
      offsetDays={35}
      dateField="escalationDate"
      reasonField="escalationReason"
      label="Escalation"
      exportFilename="escalation-bills"
    />
  );
}
