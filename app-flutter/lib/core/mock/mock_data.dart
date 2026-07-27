/// ALL placeholder content in the app lives here and nowhere else
/// (spec §4 mock rule). Views import this file only for content that is
/// rendered inside a [MockStamp]. Grep for imports of this file to get the
/// complete inventory of what is not real yet.
///
/// Sample values are lifted from the design bundle
/// (`NerdyApp Study Companion Design.zip`) so the UX reads as proposed.
library;

typedef MockStat = ({String label, String value, String unit});
typedef MockSessionRow = ({String time, String title, String code, String mode});
typedef MockBadge = ({String name, String desc});
typedef MockGoal = ({String name, String line, double progress, String state});
typedef MockMilestone = ({String mark, String name, String desc, String due});
typedef MockChartBar = ({String day, double hours});
typedef MockSplitRow = ({String name, String hours, String count, String avg});
typedef MockLibraryRow = ({String name, String subject, String type, String opens});
typedef MockPref = ({String name, String desc, bool on});
typedef MockScheduleBlock = ({int day, double startH, double hours, String title, String mode});
typedef MockSubjectExtra = ({String level, double weekProgress, String hoursLine, List<String> topics});

const mockStatStrip = <MockStat>[
  (label: 'Streak', value: '23', unit: ' days'),
  (label: 'This week', value: '14.5', unit: ' / 22h'),
  (label: 'XP today', value: '+320', unit: ''),
];

const mockUpNext = (
  kicker: 'MTH · Linear Algebra',
  title: 'Proof workshop — spectral theorem',
  meta: '10:00 – 12:00 · 2h · planned as Focus',
);

const mockTodayRest = <MockSessionRow>[
  (time: '14:00–15:00', title: 'SN1/SN2 problem set', code: 'CHM', mode: 'Normal'),
  (time: '16:30–17:30', title: 'Memory & encoding — reading', code: 'PSY', mode: 'Focus'),
  (time: '20:00–21:00', title: 'Flashcard review', code: 'MTH', mode: 'Normal'),
];

const mockXp = (level: 7, levelName: 'Deep Diver', total: '48,210', line: '1,790 XP', next: 8, progress: .74);

const mockBadges = <MockBadge>[
  (name: 'Night Owl', desc: '10 sessions ended after 23:00'),
  (name: 'Iron Week', desc: 'Hit every weekly target'),
  (name: 'Comeback', desc: 'Rebuilt a broken streak to 14 days'),
  (name: 'Deep Focus ×50', desc: '50 focused sessions completed'),
];

/// Identity-free by design: the interruption log records the KIND of event,
/// never which app was involved (data-model.md §3.6). A mock promising per-app
/// counts would advertise a capability the privacy line forbids.
const mockHeldBack = <({String kind, String count})>[
  (kind: 'Notifications', count: '13'),
  (kind: 'Focus-loss prompts', count: '4'),
  (kind: 'Exit attempts', count: '1'),
];

const mockScheduleBlocks = <MockScheduleBlock>[
  (day: 0, startH: 9, hours: 1.5, title: 'Ochem — mechanisms', mode: 'Focus'),
  (day: 1, startH: 10, hours: 2, title: 'Proof workshop', mode: 'Focus'),
  (day: 1, startH: 16.5, hours: 1, title: 'Psych reading', mode: 'Normal'),
  (day: 2, startH: 10, hours: 2, title: 'Spectral theorem', mode: 'Focus'),
  (day: 2, startH: 14, hours: 1, title: 'SN1/SN2 set', mode: 'Normal'),
  (day: 3, startH: 9.5, hours: 1.5, title: 'Flashcards + review', mode: 'Normal'),
  (day: 4, startH: 11, hours: 2, title: 'Past paper — timed', mode: 'Ultra'),
  (day: 5, startH: 10, hours: 3, title: 'Deep work block', mode: 'Ultra'),
];

const mockGoals = <MockGoal>[
  (name: 'Linear Algebra', line: '5.5 / 7h', progress: .79, state: 'On track'),
  (name: 'Organic Chemistry', line: '3.0 / 6h', progress: .5, state: 'Behind'),
  (name: 'Cognitive Psych', line: '4.0 / 4h', progress: 1, state: 'Done'),
  (name: 'Thesis reading', line: '2.0 / 5h', progress: .4, state: 'Behind'),
];

const mockMilestones = <MockMilestone>[
  (mark: '✓', name: 'Finals block booked', desc: 'All revision sessions scheduled', due: 'done'),
  (mark: '2', name: 'Mock exam ≥ 80%', desc: 'Past paper under Ultra Focus', due: '8 Aug'),
  (mark: '3', name: 'Thesis lit review drafted', desc: '12 sources summarised', due: '30 Aug'),
];

const mockStatsCells = <MockStat>[
  (label: 'Current streak', value: '23', unit: ' days'),
  (label: 'Longest streak', value: '41', unit: ' days'),
  (label: 'Hours (30d)', value: '87.5', unit: ''),
  (label: 'Focus quality', value: '4.2', unit: ' / 5'),
];

const mockChart = <MockChartBar>[
  (day: 'Mo', hours: 2.5), (day: 'Tu', hours: 4.0), (day: 'We', hours: 3.0),
  (day: 'Th', hours: 5.5), (day: 'Fr', hours: 1.5), (day: 'Sa', hours: 0),
  (day: 'Su', hours: 4.5), (day: 'Mo', hours: 3.5), (day: 'Tu', hours: 2.0),
  (day: 'We', hours: 4.0), (day: 'Th', hours: 6.0), (day: 'Fr', hours: 2.5),
  (day: 'Sa', hours: 1.0), (day: 'Su', hours: 3.0),
];

const mockSubjectSplit = <MockSplitRow>[
  (name: 'Linear Algebra', hours: '24.5', count: '18', avg: '1h 22m'),
  (name: 'Organic Chemistry', hours: '19.0', count: '15', avg: '1h 16m'),
  (name: 'Cognitive Psych', hours: '16.5', count: '11', avg: '1h 30m'),
  (name: 'Thesis reading', hours: '12.0', count: '7', avg: '1h 43m'),
];

const mockLibraryRows = <MockLibraryRow>[
  (name: 'Axler — Linear Algebra Done Right.pdf', subject: 'Linear Algebra', type: 'PDF', opens: 'SumatraPDF'),
  (name: 'Clayden Ch. 15 problem set.pdf', subject: 'Organic Chemistry', type: 'PDF', opens: 'SumatraPDF'),
  (name: 'Anki — Ochem mechanisms', subject: 'Organic Chemistry', type: 'Deck', opens: 'Anki'),
  (name: 'Lecture 12 — memory systems.mp4', subject: 'Cognitive Psych', type: 'Video', opens: 'mpv'),
  (name: 'Zotero — thesis collection', subject: 'Thesis reading', type: 'Link', opens: 'Zotero'),
];

const mockFocusPrefs = <MockPref>[
  (name: 'Mute app notifications', desc: 'NerdyApp stays silent during any session', on: true),
  (name: 'Return prompt on focus loss', desc: 'Switching away shows a gentle pull-back with time remaining', on: true),
  (name: 'Keep screen awake', desc: 'Display never sleeps while a session runs', on: true),
  (name: 'Log escapes to the interruption log', desc: 'Every switch-away is recorded with duration', on: true),
];

const mockUltraPrefs = <MockPref>[
  (name: 'Fullscreen, always on top', desc: 'The session view owns the screen', on: true),
  (name: 'Block task switching', desc: 'Alt+Tab and Win are swallowed while locked', on: false),
  (name: 'Allowlist survives the lock', desc: 'Chosen study tools stay reachable', on: true),
  (name: 'Emergency exit with friction', desc: 'Hold to exit; every exit is logged and costs XP', on: false),
];

const mockSubjectExtras = <MockSubjectExtra>[
  (level: 'Lv 6', weekProgress: .79, hoursLine: '5.5 / 7h', topics: ['Eigenvalues', 'Spectral theorem', 'Proof technique']),
  (level: 'Lv 4', weekProgress: .5, hoursLine: '3.0 / 6h', topics: ['SN1/SN2', 'Carbonyls']),
  (level: 'Lv 5', weekProgress: 1, hoursLine: '4.0 / 4h', topics: ['Memory', 'Attention']),
  (level: 'Lv 2', weekProgress: .4, hoursLine: '2.0 / 5h', topics: ['Lit review']),
  (level: 'Lv 3', weekProgress: .6, hoursLine: '3.0 / 5h', topics: ['Grammar', 'Listening']),
];

/// Cycles extras for however many real subjects exist.
MockSubjectExtra mockExtraFor(int index) =>
    mockSubjectExtras[index % mockSubjectExtras.length];
