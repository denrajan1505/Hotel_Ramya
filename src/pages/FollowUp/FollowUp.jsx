import MultiMilestoneStatusPage from '../shared/MultiMilestoneStatusPage';

const MILESTONES = [
  { key: 'followUp1', label: 'Follow-Up 1', offsetDays: 5, dateField: 'followUp1Date', reasonField: 'followUp1Reason' },
  { key: 'followUp2', label: 'Follow-Up 2', offsetDays: 20, dateField: 'followUp2Date', reasonField: 'followUp2Reason' },
];

export default function FollowUp() {
  return (
    <MultiMilestoneStatusPage
      title="Follow-Up"
      subtitle="Follow-Up 1 and Follow-Up 2 together for every bill that still needs chasing — Portal and Paid bills are not shown here"
      milestones={MILESTONES}
      exportFilename="follow-up"
      showBillAmount
    />
  );
}
