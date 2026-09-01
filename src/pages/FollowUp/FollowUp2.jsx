import MilestoneStatusPage from '../shared/MilestoneStatusPage';

export default function FollowUp2() {
  return (
    <MilestoneStatusPage
      title="Follow-Up 2"
      subtitle="Second follow-up tracking for every bill — not payment or approval status"
      offsetDays={20}
      dateField="followUp2Date"
      reasonField="followUp2Reason"
      label="Follow-Up 2"
      exportFilename="follow-up-2"
    />
  );
}
