import MilestoneStatusPage from '../shared/MilestoneStatusPage';

export default function BillStatusCourier() {
  return (
    <MilestoneStatusPage
      title="Bill Status — Courier"
      subtitle="Courier delivery tracking for every bill — not payment or approval status"
      offsetDays={2}
      dateField="courierSentDate"
      reasonField="courierReason"
      label="Courier"
      exportFilename="bill-status-courier"
    />
  );
}
