export const mira = Object.freeze({
  training: [
    'We’re preparing a small review. Separate the known details from this provisional division of work.',
    'Room evidence: Cedar-47 is the draft serial.',
    'Current aim: Mira might give final approval for Cedar-47.',
    'Working agreement: Vendor attendance is still undecided.',
    'Please acknowledge this here and leave the Desk as it is.',
  ].join('\n'),
  pending: [
    'I am checking how to document yesterday’s unconfirmed proposal.',
    'Current aim: Mira might give final approval for Cedar-47.',
    'Please acknowledge this here. Leave the Desk as it is.',
  ].join('\n'),
  correction: [
    'Please update the working understanding for this room. I am the owner and I give final approval personally. Mira checks wording only. Keep the draft serial and unresolved vendor attendance as before.',
    'Current aim: The owner gives final approval for Cedar-47. Mira checks wording only.',
    'Reply here without changing the Desk.',
  ].join('\n'),
  ownerCorrection: 'I give final approval for Cedar-47. Mira checks wording only.',
  fresh: 'Before I tell the team, please summarize the decision roles for this specific draft, its serial, and whether vendor attendance is confirmed. Address me directly. Reply here and leave the Desk untouched.',
});

export const solo = Object.freeze({
  training: [
    'The project is a rough teaser. I can tell which edits work in a joint review, but the collaborator’s notes do not tell us exactly how they would react next time.',
    'Room evidence: The creator makes the final cut.',
    'Current aim: Make a repeatable solo review using actual rough-cut moments.',
    'Working agreement: Ask what I noticed first, then use my notes as evidence. Leave the cut with me.',
    'Room rule: Do not claim to know whether someone else improved the judgment or the confidence to use it unless we have tested it.',
    'Reply here without using the Desk.',
  ].join('\n'),
  fresh: 'When my collaborator joins a review, I can hear which moments of the rough teaser feel alive. I have a few notes. I am reviewing alone tomorrow. Give me a short reusable review prompt that I can paste in immediately. I can add the notes and a timed moment during review. Reply here and leave the Desk as it is.',
});
