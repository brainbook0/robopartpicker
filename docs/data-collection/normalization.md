# Data normalization and identity decisions

Normalization never replaces source evidence. Every normalized claim retains
the original value and unit, normalized value and unit, registry version,
conversion source, and observation timestamp.

## Engineering-unit registry

Registry version: `engineering-units/1`

| Input aliases | Normalized unit | Rule |
| --- | --- | --- |
| `A`, `mA` | `A` | Exact SI scale |
| `V`, `mV` | `V` | Exact SI scale |
| `kg`, `g`, `mg` | `kg` | Exact SI scale |
| `m`, `cm`, `mm` | `m` | Exact SI scale |
| `N.m`, `N·m`, `Nm` | `N.m` | Identity or punctuation alias |
| `rpm` | `rpm` | Engineering identity |
| `rad/s` | `rad/s` | SI identity |
| `W` | `W` | SI identity |
| `Wh` | `Wh` | Engineering identity |

Unsupported units are rejected for review; they are not estimated.
Non-finite values are rejected.

Currency values remain in the observed ISO 4217 currency unless an explicit
rate is supplied. Converted records retain the multiplier, target currency,
rate source, rate publication time, and observation time. There is no silent
currency conversion.

## Identity candidates

Candidate generation validates that each referenced canonical row exists and
has the requested entity type before scoring it. Deterministic ranking uses,
in order:

1. exact manufacturer part number plus manufacturer;
2. exact manufacturer part number;
3. normalized name plus category;
4. normalized name;
5. bounded token similarity.

Ties remain `ambiguous`; no result automatically permits promotion. AI
candidate signals are attached separately and do not modify deterministic
scores or order.

Alternatives and substitutions require two distinct, existing component
identities, a reason, and evidence. A successful outcome remains `null` until
reported or measured outcome evidence is provided.

## Conflicts and lifecycle

Repeated normalized values do not create a conflict. Contradictory values
create a deterministic open conflict set containing every claim. Resolution
returns a new resolved view with a preferred member and notes; it does not
delete or rewrite source claims.

Lifecycle events are append-only. Current views are calculated by source
occurrence time, then receipt time, so a late-arriving older event cannot
replace a newer firmware, release, project version, availability, source
policy, specification, or delisting state. Supersession must point to an
existing event of the same mutable class. Claim withdrawal and
missing-information transitions preserve prior history.
