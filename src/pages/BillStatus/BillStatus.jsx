import MultiMilestoneStatusPage from '../shared/MultiMilestoneStatusPage';

const MILESTONES = [
  { key: 'email', label: 'Email', offsetDays: 2, dateField: 'mailSentDate', reasonField: 'mailReason' },
  { key: 'courier', label: 'Courier', offsetDays: 4, dateField: 'courierSentDate', reasonField: 'courierReason' },
];

export default function BillStatus() {
  return (
    <MultiMilestoneStatusPage
      title="Bill Status"
      subtitle="Email and Courier delivery tracking together for every bill that still needs sending — Portal and Paid bills are not shown here"
      milestones={MILESTONES}
      exportFilename="bill-status"
    />
  );
}
