# Personalized opening repertoires

Open **My repertoire**, connect the Lichess explorer, select a favorite opening for either color, and choose **Generate repertoire**. Save the finished variations to revisit them, download PGN, or add the user's decisions to the existing spaced repetition trainer.

## Fixed size

The target is ten distinct variations per selected opening. Every completed variation has exactly 32 plies from the normal initial position, including the named opening prefix: sixteen full moves, ending after Black's sixteenth move. Search depth is not used. No engine is involved.

Lichess may lack continuation data in unusual positions. Short lines and games that end before move sixteen are excluded; the interface reports when fewer than ten complete variations are available. It never invents moves or pads short lines.

## Selection

The bundled CC0 Lichess catalog identifies named positions in the imported games, including alternate move orders. Matching prefers the opening name, then its ECO code, then a supported reference reached in those games. Only the connected account's games inform favorite openings.

The generator collects up to ten distinct early opponent branches, ranked by move frequency from rated Lichess blitz, rapid and classical games. On the user's turns it selects one most-played response per position. Once ten variations exist, it preserves those early branches and extends each using the most-played continuation. If fewer branches are available, it also considers the next opponent decision. This prioritizes coverage of different early replies rather than ten tiny differences at the end of one line. It does not prove globally most common lines or objectively best play; frequencies do not replace engine evaluation.

## Lichess connection

The current public API requires OAuth authentication. The client uses the authorization-code flow with PKCE (S256), random state validation and no additional permission scopes. Access tokens live in session storage, expire according to the response, and are sent only in authorization headers to the Lichess explorer. The callback returns to `/app/repertoire` and removes authorization parameters from the URL. HTTPS or localhost is needed for browser cryptography.

- OAuth: https://lichess.org/api#tag/OAuth
- Explorer: https://explorer.lichess.org/lichess
- Opening definitions: https://github.com/lichess-org/chess-openings

Requests are sequential, separated by at least 550 ms, abortable and time-limited. Rate limits trigger a wait of at least one minute (or the server's Retry-After), with two retries. The initial generation can take several minutes. Position statistics are cached for seven days, bounded at 2,500 entries. Authentication is needed for uncached requests.

## Persistence and checks

IndexedDB version 2 adds a separate explorer cache and retains the existing game, repertoire, connection and training stores. Generated lines have source, opening, account and sample-size metadata. Saving replaces only the same generated opening/color/account group in one transaction. Handwritten lines are preserved. Training deduplicates positions and moves and preserves existing review schedules.

Run `npm run test:repertoire` for generation and database migration checks. `npx tsc --noEmit` and `npm run build` check the application integration. Live data generation additionally requires a user's Lichess authorization.
