# Shipforte platform requirements

A simple website where users take on time-limited app-building challenges, share
their implementations, earn kudos, and give each other feedback. Projects may be
built with or without AI.

Platform name: **Shipforte**. Canonical production URL: **https://shipforte.com**.

Unchecked items represent work to implement, not completed features. The initial
product decisions have been clarified and incorporated into the checklist below.

Checked items have been implemented. The GitHub App is configured, and the live
OAuth redirect and webhook signature checks pass. End-to-end user sign-in and
repository submission still require verification with an authorized user account.

## 1. Accounts and GitHub connection

- [x] Users can connect their GitHub account to their platform account.
- [x] Integrate with the GitHub App that the project owner will create.
- [x] Discover users' own public repositories automatically after GitHub sign-in; selecting a repository for submission shares it with the platform. Organization repositories can be shared through a GitHub App installation.
- [x] Distinguish regular users from moderators and enforce moderator-only actions.

## 2. Dashboard and challenges

- [x] Provide a dashboard listing live challenges: app ideas users can build with or without AI.
- [x] Keep challenges with a submitted attempt out of All challenges and the category tabs, and place them in a Completed tab in the same tab row. Search and size filters apply within the selected tab; completion is independent of kudos eligibility.
- [x] Each challenge has a brief explaining what to build and a duration expressed in days ("build X in Y days").
- [x] Show the challenge's kudos award before a user accepts it.
- [x] The challenge maker selects a sizing tier that determines the full kudos award: small (50), medium (80), large (120), or xlarge (160).
- [x] Users can open a challenge to read its brief and see other users' submissions.
- [x] Users can accept a challenge and begin their own attempt.
- [x] Limit each user to one active attempt per challenge at a time.
- [x] Start the user's countdown when they accept the challenge.
- [x] Record the acceptance time and deadline for each attempt.
- [x] Do not allow users to abandon an attempt or restart it to reset its countdown.
- [x] Passing the deadline only ends the attempt's kudos award period; the attempt remains available for submission with its original deadline.
- [x] Show users their active attempts, remaining time, and attempt status.
- [x] At submission time, compare the platform's recorded submission time with the attempt's deadline to determine kudos eligibility.
- [x] A submission is on time only when its recorded submission time is strictly before the deadline; submissions received exactly at or after the deadline earn no kudos and cannot restore redo kudos.
- [x] Allow submissions after the deadline, including repeat attempts and redos, but award no kudos for late submissions and do not restore kudos removed for a redo.

## 3. Project submissions

- [x] Users can submit a project for a challenge they have accepted.
- [x] Require the submitted repository to be selected through the GitHub integration; verify personal repository ownership or push access through a shared App installation.
- [x] Require submitted GitHub repositories to be public; private repositories and private challenges are outside the current scope and may be considered in the future.
- [x] Automatically resolve and pin the latest commit on the repository's default branch when the user submits; do not require a manually supplied commit SHA.
- [x] Verify that the resolved commit belongs to the selected public repository and is accessible to the platform.
- [x] Identify the submitted implementation by its repository and full commit SHA; later branch updates must not change it.
- [x] Save a code snapshot at the submitted commit for every submission so its code and inline comments remain viewable if the repository is deleted, made private, or becomes inaccessible.
- [x] Require users to upload screenshots of the working output as part of submitting.
- [x] Require at least one screenshot per submission; accept PNG, JPEG, and WebP images up to 10 MB each.
- [x] Associate screenshots with the specific submission they demonstrate.
- [x] Other users can view submissions, their screenshots, and the submitted repository/commit details.
- [x] Display the code from the submitted commit for platform-based code review.
- [x] Preserve earlier submission versions when a user makes an eligible resubmission.
- [x] Let users submit privately on Shipforte, preserving the immutable snapshot and original submission time. Only the owner can access private submissions and their attachments; exclude them from public feeds, counts, profiles, leaderboards, notifications to other users, and timelines on older versions.
- [x] Withhold eligible kudos until the owner publishes. Evaluate timeliness using original submission time even if publication occurs after the deadline; late submissions remain ineligible. Reserve eligible repository/code claims on private submission to prevent reuse while awaiting publication.
- [x] Allow only one-way private-to-public publication, with explicit owner confirmation. Public submissions cannot become private. Retain the existing public GitHub repository requirement; external repositories, demos, and transcript shares have independent visibility.
- [x] Defer replacement archival and community notifications until publication. Require publishing a private submission before starting another attempt for that challenge. Keep redo kudos on hold until publication and honor moderator revocations of prior awards.
- [x] Support private visibility in MCP drafts and show it in the mandatory review page. Let agents list their owner’s private submissions and request a publication review link, without bypassing browser approval.

## 4. Kudos and repeat attempts

- [x] Award kudos for valid, on-time public submissions. For private submissions, reserve eligibility on submission and release kudos only on publication.
- [x] Record the kudos awarded for each submission and reflect awards in the user's total.
- [x] Prevent duplicate awards for the same submission.
- [x] After a submission receives an award, block that repository from reuse across all challenges, except through a permitted redo or moderator-enabled resubmission of the original challenge.
- [x] Treat forks and copies of an awarded repository as reuse; they do not qualify as new repositories for repeat attempts.
- [x] Allow the user to submit a new attempt using a different repository.
- [x] Start a fresh countdown for the challenge's full duration when the user starts a new-repository repeat attempt or a moderator-enabled resubmission; moderator permission alone does not start the clock.
- [x] Award one fifth (20%) of the original kudos amount for each new-repository repeat submission: small (10), medium (16), large (24), or xlarge (32).
- [x] Allow improvements to the same repository to be resubmitted once sufficient redo votes unlock that option.
- [x] Unlock a redo when at least 30 distinct users have voted and redo votes account for at least 25% of all votes on the submission.
- [x] Once redo eligibility is unlocked, keep it unlocked even if later vote changes bring the submission below either threshold.
- [x] When the user starts an unlocked redo, start a fresh countdown for the challenge's full duration; unlocking eligibility alone does not start the clock.
- [x] When offering a redo, show a notice before acceptance explaining that accepting removes the kudos already earned for that challenge, starts a fresh full-duration countdown, and requires a new valid submission before the new deadline to restore those kudos. State that missing the deadline leaves those kudos lost.
- [x] When the user accepts a redo, remove the kudos they have already earned for that challenge from their total.
- [x] Restore those kudos only for a new valid submission received before the redo deadline, withholding restoration until publication if submitted privately; record the removal and restoration in the award history and submission timeline.
- [x] Record an improved resubmission at its own specific commit and link it to the previous submission.
- [x] Treat the improved version as a new submission with fresh votes; votes belong to individual submissions and do not carry over.
- [x] Archive and freeze the old submission when its replacement becomes public: disallow new votes and show the notice "This submission is archived. View the new submission", with a link to its replacement.
- [x] Allow moderators to enable resubmission without revoking existing kudos; permitting or starting this resubmission does not remove the user's existing award.
- [x] Award new kudos for a valid, on-time moderator-enabled resubmission rather than restoring a previous award.
- [x] Award the full challenge amount for a valid, on-time moderator-enabled resubmission when the previous submission and its award were revoked.
- [x] Award 20% of the original challenge amount for a valid, on-time moderator-enabled resubmission when the previous submission was not revoked; retain its existing kudos.
- [x] Show users whether they are eligible to resubmit and which award rules apply.

## 5. Voting and submission leaderboard

- [x] Provide a submission leaderboard for each challenge, ranked by submission vote score.
- [x] Exclude archived submissions and submissions with revoked awards from challenge leaderboards.
- [x] Provide a global user leaderboard ranked by current total kudos, highest first; reflect award grants, revocations, and redo-related kudos removals and restorations.
- [x] Give tied submissions the same rank on challenge leaderboards and tied users the same rank on the global kudos leaderboard.
- [x] Other users can vote **up**, **down**, or **redo** on an implementation.
- [x] Prevent users from voting on their own submissions.
- [x] Allow each user one mutually exclusive vote per submission: up, down, or redo. Users can change or remove their vote while the submission is active.
- [x] Freeze existing votes on archived submissions; users cannot add, change, or remove votes after archival.
- [x] Show the implementation's up, down, and redo vote statistics.
- [x] Rank submissions by upvotes minus downvotes, with higher scores ranked first. Redo votes control redo eligibility and do not affect the ranking score.
- [x] Update leaderboard placement as votes change.
- [x] Track redo votes against the threshold required to unlock a same-repository resubmission.
- [x] Make the unlocked resubmission action available to the author when that threshold is met.

## 6. Discussion and inline code comments

- [x] Users can comment on each other's implementations on the submission page.
- [x] Users can leave inline comments on submitted code within the platform.
- [x] Allow users to review and comment on any file in the submitted code snapshot.
- [x] Provide a diff view comparing a resubmission with its previous submission to show what changed.
- [x] Store inline comments on the platform rather than creating GitHub comments or reviews.
- [x] Anchor each inline comment to the submission version, commit, file path, and relevant line or line range.
- [x] Keep comments attached to the originally reviewed code when an improved version is submitted.
- [x] Use [`@pierre/diffs`](https://diffs.com/docs) for code and diff viewing with platform-owned inline comments rendered through its annotation support; use a beta release if required for the needed functionality.

## 7. Submission event timeline

- [x] Each challenge submission page includes a chronological timeline of events.
- [x] Use the timeline for major lifecycle events, including redo unlocks; display comments and vote totals separately rather than listing individual comments or votes as timeline events.
- [x] Include the attempt's challenge acceptance and start time in its history.
- [x] Record the initial submission and its commit.
- [x] Record kudos awards and award revocations.
- [x] Record moderator reviews and actions, including the reason for a revocation.
- [x] Record when redo voting unlocks resubmission.
- [x] Record subsequent submissions and their associated commits.
- [x] Show event timestamps and the responsible user or system actor.

## 8. Submission moderation

- [x] Moderators can review submissions, including the challenge brief, submitted code, screenshots, and history.
- [x] Moderators can revoke a submission's award for any reason.
- [x] When revoking an award, moderators choose whether to permit resubmission; revocation alone does not automatically reopen submission eligibility.
- [x] Support reasons including insufficient fulfillment of the brief and a user requesting a resubmission.
- [x] Record the moderator, reason, timestamp, and affected award when revoking kudos.
- [x] Update the user's kudos total after an award is revoked without removing the historical award record.
- [x] Make the submission's current award and resubmission status visible.

## 9. Community-authored challenges

- [x] Users can propose challenges, including the brief, time limit, and sizing tier.
- [x] Support GitHub-flavoured Markdown in challenge briefs, with an authoring preview and consistent rendering of saved briefs on submission pages.
- [x] Proposed challenges enter a moderation queue before publication.
- [x] Challenge authors can edit their proposals until approval, including in response to moderator feedback.
- [x] Moderators can review proposed challenges and approve, reject, or request changes.
- [x] Only approved challenges become live and appear as available challenges.
- [x] Once a challenge is live, only moderators can update it, including when the original author wants changes.
- [x] Moderators can archive and restore published challenges. Archived challenges are unlisted from public discovery, remain readable by direct link, and accept no new attempts or invitations. Existing attempts retain their terms and can still be submitted.
- [x] Archived challenges remain editable only by moderators; editing does not relist them. Record archive and restore actions in submission timelines.
- [x] Preserve the brief, deadline, and kudos amount accepted for each existing attempt when a moderator edits the live challenge; retain those terms with its submission history.

## 10. Following, invitations, and notifications

- [x] Users can follow other users within the platform; platform follows are independent of GitHub follows.
- [x] Users can invite users they follow to complete a challenge.
- [x] Block duplicate invitations to the same recipient for the same challenge and invitations to users already participating in that challenge.
- [x] Deliver challenge invitations to the recipient's in-platform notifications area.
- [x] Track read/unread status for notifications; opening a notification marks it as read, and users can mark all notifications as read.
- [x] Notify users about comments on their submissions, kudos awards and revocations, and unlocked redo eligibility.
- [x] Do not send notifications for votes themselves, individually or in groups; notify only when votes trigger an actionable outcome, such as unlocking a redo opportunity.
- [x] Notify inviters about recipients' progress on the challenges they were invited to complete.
- [x] Include the inviter and a link to the relevant challenge in the invitation.
- [x] Show relevant challenge status and submission vote statistics in the notifications area.
- [x] Keep displayed status and vote statistics current as the related activity changes.
- [x] Recipients can go directly from an invitation to accepting the challenge.
- [x] Do not require a separate invitation-acceptance step.
- [x] Receiving or viewing an invitation does not start the countdown; accepting the challenge does.

## 11. Build-session transcripts and connected agents

- [x] Allow optional build-session attachments on submissions: uploaded Markdown, TXT, JSON, or JSONL (up to 10 MB), pasted text, or HTTPS share links; up to ten sessions per submission version.
- [x] Make attached transcripts public by default when the submission is published; keep unsubmitted uploads private to their owner.
- [x] Allow moderators to hide and restore individual submitted transcripts, recording a reason and timeline event. Hidden transcripts and downloads remain available only to the author and moderators.
- [x] Automatically identify the harness, session title, version, agent name, models, token usage, and reported USD cost from supported exports. Users attach the artifact or URL without filling out metadata fields. Missing metrics stay unreported; non-USD credits and multipliers are not treated as dollar amounts.
- [x] Provide a conversation view for recognized structured records, a safe text/Markdown preview, and original downloads; treat external links as changeable references and transcripts as user-provided provenance.
- [x] Offer a remote Streamable HTTP MCP server with OAuth/PKCE, consent, scoped Shipforte credentials, refresh, and revocable connections.
- [x] Let connected agents read challenges and accepted attempts, discover accessible repositories, upload screenshots/transcripts, and prepare submission drafts.
- [x] Require the signed-in owner to review the exact commit and attachments and click **Approve and submit** in Shipforte for every MCP submission. MCP tokens cannot invoke the browser approval endpoint.
- [x] Reuse the existing submission service for repository access, snapshots, screenshots, reuse checks, deadlines, and kudos; record approval-request arrival as submission time.
- [x] Reject stale commit previews and concurrent draft changes; finalize the draft and submission atomically and support idempotent draft preparation and approval retries.
- [x] Show connected agents and drafts in the UI, notify owners of prepared drafts, and provide rejection and revocation controls.
- [x] Expire drafts after seven days and connections after thirty days; clean abandoned transcript uploads and expired bookkeeping through an hourly trigger.
- [ ] Verify end-to-end GitHub sign-in, MCP authorization/refresh, and project publication with authorized user accounts in the target harnesses.

## 12. Structured requirements and project showcases

- [x] Authors and moderators can create, reorder, edit, and remove required checklist items and optional stretch goals alongside the Markdown brief. Preserve the accepted checklist with each attempt.
- [x] Interpret explicit requirement sections in legacy briefs when no structured checklist has been saved; use the original attempt brief for existing attempts. An intentionally empty checklist remains empty.
- [x] Builders can report completion, notes, and attached screenshot evidence for each accepted requirement. Evidence is immutable with the submitted version and is labelled as builder-reported.
- [x] Allow public feedback on individual requirements, anchored to the submitted attempt’s checklist, independently of general and inline code discussion.
- [x] MCP returns structured challenge/attempt requirements and accepts evidence, demo recording links, and learning notes in reviewable submission drafts.
- [x] Builders can pin and order up to three of their public, active submissions on their profile. Private, archived, and revoked submissions cannot be featured.
- [x] Support HTTPS demo video or livestream recording links, with safe inline playback for YouTube, Vimeo, and Loom and external links for other services.
- [x] Allow authors to edit showcase recording links and Markdown learning notes after submission, with a timeline record; preserve code, evidence, deadlines, and awards.
- [x] Allow authors to select up to five captioned excerpts from attached transcript text or recognized messages. Read excerpts from the actual source and honor transcript moderation and submission privacy on every read.
- [x] Provide public submission/profile share dialogs, downloadable 1200×630 PNG cards, and server-rendered Open Graph metadata. Private submissions have no social preview or public share image.

## 13. Technical foundation

- [x] Keep select dropdowns and single-line text inputs consistent in height and styling.

- [x] Build the website using the existing application in `snowy-disk-3ef3/`.
- [x] Use its existing Cloudflare setup for application hosting and runtime.
- [x] Provision and bind a Cloudflare D1 database for application data.
- [x] Use Drizzle ORM with D1 and a SQLite-compatible schema.
- [x] Replace the starter's PostgreSQL-oriented Drizzle configuration and database connection with the D1 setup.
- [x] Persist accounts, GitHub repository connections, challenges, attempts, submission versions, screenshot metadata, votes, kudos awards/revocations, comments, timeline events, follows, invitations, and notifications.
- [x] Use Cloudflare R2 for persistent storage and delivery of uploaded screenshots.
- [x] Configure the GitHub App integration after the project owner provides its configuration.

### Existing setup notes

- `snowy-disk-3ef3/` contains a React/TanStack Start application with Cloudflare configuration.
- `snowy-disk-3ef3/wrangler.jsonc` binds the `emistry` D1 database and `emistry-assets` R2 bucket.
- `snowy-disk-3ef3/drizzle.config.ts` uses the SQLite dialect for D1.
- Drizzle's [Cloudflare D1 documentation](https://orm.drizzle.team/docs/connect-cloudflare-d1) describes its D1 driver and Worker database binding.
