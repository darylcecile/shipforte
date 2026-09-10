-- Optional starter challenges. No fabricated votes, submissions, or kudos.
INSERT INTO users(id,github_id,login,name,avatar,bio,created_at)
VALUES('00000000-0000-4000-8000-000000000001',0,'shipforte','Shipforte','','A few starting points for your next great build.',1788998400000)
ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name;

INSERT OR IGNORE INTO challenges(id,author_id,title,summary,brief,tier,days,category,status,published_at,created_at,updated_at) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A tiny habit tracker','Small habits, visible progress. Build a calm little place to show up for yourself, one day at a time.','Build a habit tracker that makes daily progress feel satisfying.

What it needs to do
• Create and name habits.
• Mark a habit complete for a particular day.
• Show at least a week of progress, with a useful empty state.
• Persist progress across page reloads.
• Work comfortably on a phone.

Make it yours
Choose your own visual style and technology. Thoughtful feedback and easy recovery from an accidental checkmark matter more than a long feature list.

Submission
Include setup instructions in your repository and screenshots showing both an empty state and a populated tracker.','small',3,'Productivity','live',1788998400000,1788998400000,1788998400000),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Your personal link library','Make the internet a little less scattered. Give your favorite links a home you actually want to revisit.','Build a personal bookmark library.

Required functionality
• Save a link with a title and optional notes.
• Organize links with tags or collections.
• Search your saved links.
• Edit and remove entries.
• Persist the library across visits.

Consider the experience of saving your first link, searching for something that is not there, and browsing a growing collection. Include keyboard-friendly forms and a mobile layout.

Submit a public repository with setup instructions and screenshots of your working library.','medium',7,'Tools','live',1788998300000,1788998300000,1788998300000),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Make a little generative art','A blank canvas, a few rules, and something unexpected. Turn simple inputs into art worth saving.','Create an interactive generative art tool.

The essentials
• Generate an original visual composition from a seed or set of inputs.
• Offer at least three meaningful controls.
• Allow a composition to be reproduced from the same settings.
• Export the result as an image.

Choose any visual language: geometry, typography, organic forms, or something entirely your own. Make the controls approachable, include a reset option, and ensure the interface works on a smaller screen.

Submit screenshots of the tool and a few generated outputs with the source repository.','medium',5,'Creative','live',1788998200000,1788998200000,1788998200000),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','A neighborhood noticeboard','Found a great café? Starting a book club? Build a small, useful home for the things happening nearby.','Build a community noticeboard with a complete posting and browsing experience.

Required functionality
• Create notices with a title, body, and category.
• Browse and filter notices.
• Open a notice to view its details.
• Allow authors to edit and remove their own notices.
• Persist data on a backend and implement real authentication.
• Provide a basic moderation action for removing inappropriate notices.

Keep the interface accessible and mobile-friendly. Document local setup, authentication configuration, and how a moderator is designated. Submit screenshots demonstrating the core flows.','large',10,'Community','live',1788998100000,1788998100000,1788998100000),
('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Five minutes of wordplay','Build a word game with one simple rule: it should be easy to start and hard to put down.','Create an original browser-based word game.

Required functionality
• Explain the rules clearly before or during the first game.
• Validate player input and provide immediate feedback.
• Include a clear win, loss, or end-of-round state.
• Let players start another round.
• Save the best score or recent results locally.

Make the game usable with a keyboard and touch controls. You can use an open word list, but document its source and license. Include screenshots of gameplay and the final result.','small',4,'Games','live',1788998000000,1788998000000,1788998000000),
('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Teach something interactively','Take a concept you understand and help someone else have that satisfying “oh, now I get it” moment.','Build a complete interactive learning experience around one concept.

Required functionality
• Provide a structured sequence of at least three lessons or steps.
• Include an interactive demonstration, not just text and images.
• Check understanding with exercises and helpful feedback.
• Track a learner’s progress across visits.
• Include an accessible way to restart or revisit earlier material.
• Support user accounts and persistent progress on a backend.

Choose a focused topic and explain why your interaction helps someone understand it. Include setup instructions and screenshots showing the learning flow, exercises, and progress tracking.','xlarge',14,'Learning','live',1788997900000,1788997900000,1788997900000);
