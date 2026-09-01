import MilestoneStatusPage from '../shared/MilestoneStatusPage';

export default function FollowUp1() {
  return (
    <MilestoneStatusPage
      title="Follow-Up 1"
      subtitle="First follow-up tracking for every bill — not payment or approval status"
      offsetDays={5}
      dateField="followUp1Date"
      reasonField="followUp1Reason"
      label="Follow-Up 1"
      exportFilename="follow-up-1"
    />
  );
}
