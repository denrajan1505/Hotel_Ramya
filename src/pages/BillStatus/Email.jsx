import MilestoneStatusPage from '../shared/MilestoneStatusPage';

export default function BillStatusEmail() {
  return (
    <MilestoneStatusPage
      title="Bill Status — Email"
      subtitle="Email delivery tracking for every bill — not payment or approval status"
      offsetDays={0}
      dateField="mailSentDate"
      reasonField="mailReason"
      label="Email"
      exportFilename="bill-status-email"
    />
  );
}
