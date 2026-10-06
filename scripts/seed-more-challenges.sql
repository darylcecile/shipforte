-- Additional starter challenges. Fixed IDs make this safe to run again without
-- replacing moderator edits or changing existing attempts, submissions, or awards.
INSERT OR IGNORE INTO users(id,github_id,login,name,avatar,bio,created_at)
VALUES('00000000-0000-4000-8000-000000000001',0,'shipforte','Shipforte','','A few starting points for your next great build.',1788998400000);

INSERT OR IGNORE INTO challenges(id,author_id,title,summary,brief,tier,days,category,status,published_at,created_at,updated_at) VALUES
('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001',
'Build a three-level 2D platformer',
'Three levels, one little hero, and a satisfying jump. Build a complete platformer with a beginning, a challenge, and a finish line.',
'Build a simple, playable 2D platformer with three distinct levels.

## Required functionality
- Give the player responsive left/right movement and jumping, with reliable gravity and platform collisions.
- Create three individually designed levels with a clear start and exit. Introduce the controls in level one and increase the challenge in later levels.
- Include obstacles or hazards that can defeat the player, with a quick retry from a sensible spawn point.
- Show the current level and provide a clear way to pause, resume, and restart.
- Advance through all three levels in order and show a victory screen after the final level, with an option to play again.
- Keep essential instructions and controls visible or easy to find. The whole game must be playable with a keyboard.

## Make it yours
Choose your own theme, art style, and engine. Simple shapes are fine: prioritize reliable controls, readable hazards, and achievable jumps. Collectibles, enemies, checkpoints, and sound are optional. Document the source and license of any assets you use.

## Submission
Include setup and play instructions in the repository. Submit screenshots of each of the three levels and the victory screen. Make it possible for a reviewer to reach and play every level.',
'xlarge',14,'Games','live',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000),
('10000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001',
'Build a hangman game',
'A hidden word, a handful of guesses, and one more round. Make a friendly hangman game that feels good on a keyboard or a phone.',
'Build a complete hangman word game.

## Required functionality
- Choose a hidden word from a varied word list and show a placeholder for each letter.
- Let players guess letters using both the keyboard and on-screen controls.
- Reveal every occurrence of a correct letter. Track incorrect guesses and the number of mistakes remaining, with a clear visual indicator.
- Ignore repeated guesses and invalid input without consuming another attempt.
- End the round when the word is solved or guesses run out. Reveal the answer and clearly distinguish wins from losses.
- Offer a new round without reloading the app, and persist the win/loss tally across visits.
- Explain the rules and make the layout usable on small screens. Do not rely on color alone to communicate results.

## Make it yours
Pick an approachable theme. The traditional hangman drawing can be replaced by another visual countdown. Categories, hints, and difficulty settings are optional. Use a local word list or a reliable source and document its license.

## Submission
Include setup instructions and screenshots showing a round in progress, a win, and a loss.',
'medium',7,'Games','live',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000),
('10000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001',
'Build a pomodoro timer',
'Make room for focused work and proper breaks. Build a small, dependable timer that keeps the next step obvious.',
'Build a pomodoro timer for focused work and breaks.

## Required functionality
- Provide focus, short-break, and long-break modes with sensible defaults, such as 25, 5, and 15 minutes.
- Let users start, pause, resume, and reset the timer. Clearly show the current mode and remaining time.
- Keep elapsed time accurate when the tab is in the background or the display is refreshed; do not rely solely on decrementing a counter once per second.
- Indicate when a session finishes and let the user move to the next mode. Offer a long break after four completed focus sessions.
- Count completed focus sessions and preserve timer state and the count across page reloads.
- Support keyboard operation and a comfortable small-screen layout. The timer must remain usable when sound or browser notifications are unavailable.

## Make it yours
Choose a calm visual style and clear feedback. Adjustable durations, optional sound, and a task label are welcome but not required. Focus on a timer that is dependable and easy to understand.

## Submission
Include setup instructions and screenshots showing a running focus session, a paused timer, and a completed session or break.',
'small',3,'Productivity','live',unixepoch()*1000,unixepoch()*1000,unixepoch()*1000);
