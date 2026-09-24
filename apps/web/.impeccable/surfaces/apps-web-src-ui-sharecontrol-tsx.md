---
version: 1
slug: "apps-web-src-ui-sharecontrol-tsx"
primary_target: "apps/web/src/ui/ShareControl.tsx"
related_targets: ["apps/web/src/app/share.ts"]
---

THESIS: Sharing is a choice between two links, and the whole risk of the
feature is sending the wrong one. So the surface is a chooser that says what
each link gives away in the words somebody would use, not a pair of buttons
labelled "edit" and "view" that a person gets wrong once and then stops
trusting.

MODE: Operate. One decision, made once per board, in the middle of other work.

FORM: A sheet above the record line, cut from panel white with the contact
shadow, matching the account sheet exactly — the same shape for the same kind
of moment. NOT a modal: the craft floor bans one for a task that needs neither
interruption nor protected focus, and this is the clearest case of that in the
product.

Each link is a row on page stock with a `control-border` hairline, 50px minimum
(`--of-hit-lg`) rather than the 24px AA floor, because this is the one control in OpenFrame
where missing costs something. The row carries its name and, below it at the
12px functional floor, what it does to the person who receives it: "they can
change the board", "they can watch, and be seen watching". That second line is
the deciding information, not decoration, which is why it sits at the floor and
not below it.

VIEW-ONLY: a record, not a badge. 12px mono, muted ink, page stock, hairline,
apparatus radius — it sits in the record line beside the other readouts, which
are all mono and muted. A pill would also have been the third fully-round thing
in a world where round means "grab me": only the rotate handle and connector
endpoints are round.

FAILURE: sharing fails loudly. The correction wash and edge, with `role="alert"`
— falling back to a link without keys would hand somebody an unprotected board
at the moment they asked for a view-only one, which is the failure mode where
the interface says a thing it is not doing.

FINISH: the room is the authority, not this surface. Three end-to-end specs
through a real Durable Object, one of which dispatches straight past the
disabled button, because the interface is not the thing being trusted.
