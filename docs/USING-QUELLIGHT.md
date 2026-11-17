# Using Quellight

Quellight is your private space for conversations, organized into rooms. Use the same account on your phone and laptop.

**Release status:** Phase 2 is live at [quellight.com](https://quellight.com), including automatic memory, room settings and optional memory inspection. Your existing rooms, conversations and saved turns are preserved. Phase 3's Desk and room method are being qualified on a separate Preview; the candidate guidance below does not yet claim a production release.

## Open your space

1. Open the private setup link provided to you. Choose a password, enter it again, and select **Open Quellight**. Keep the link and password private.
2. On another device, open **[quellight.com](https://quellight.com)** and sign in with `radziamin91@gmail.com` and your password.
3. Your **Home** room is ready. On a phone, select **Open rooms** to see room and conversation navigation.

The same account opens your saved rooms and conversations on both devices.

Start **New conversation** from the plus icon in the sidebar. On a phone, select **Open rooms** first. Expand **Settings** at the bottom of the sidebar for appearance, archived rooms and sign-out. The vertical three-dot **More** menu opens **Room details** or **Export conversation**. Use **Back to conversation** from Room details to return to your draft.

The separate [local design preview](http://127.0.0.1:4320/) uses labelled sample content, not your saved conversations.

## Rooms and conversations

- Select **New room**, give it a name and optionally a purpose, then select **Create room**. A room keeps related conversations together.
- Select a room and choose **New conversation**. Write a message and send it with the arrow button or Enter. Shift+Enter adds a new line.
- Select any saved conversation to continue it. Sent messages and replies are available on both devices. You can bookmark the open conversation's address.
- Select **Room details** to rename a room or archive it. **Archived rooms** lets you return to its history. An archived room stays readable.

## Replies, drafts and Stop

Replies may take time while the model thinks. You can leave the page and reopen the conversation to see its progress. Use the square **Stop** button when you want to stop the current response. Closing a tab does not stop it.

Unsent drafts are kept on the device where you wrote them, separately for each conversation. They do not sync to your other device. A sent message clears its matching draft; anything you start typing afterward stays intact.

If the connection is interrupted, use **Reconnect** to check the saved conversation. Your draft stays available. If a response cannot finish, Quellight shows that state and you can continue with another message. A saved change may need a refresh before it appears.

## Copy, export and appearance

Use a message's copy icon to copy its text. **Export conversation** downloads the saved conversation as a text file. The **Dark appearance** switch is in the sidebar, or inside **Open rooms** on a phone.

Select **Sign out** when you finish on a shared device. Signing out removes that account's unsent drafts from the device; sent conversation history stays saved.

## Automatic memory

With **Automatic learning** on, Quellight learns from your conversations in the background. You do not need to approve each memory or open the Memory drawer to make learning happen. Conversation observations stay with their conversation; personal preferences can be used across your rooms according to each room's settings. Learning may finish after the reply appears.

Open a saved conversation and select **⋮ More → Memory** whenever you want to see what is recorded. Opening this drawer only reads memory; it does not start learning or change it.

- **Observations in this conversation** shows the current observations. **Earlier observations** shows retained previous versions; **Prepared observations** shows work waiting to be applied.
- **Personal memory** shows your saved preference profile and whether it is used in this room.
- **Memory activity** shows recorded progress and outcomes. If offered, **Retry pending memory** retries unfinished work; it does not mean that work has already succeeded.
- **Original sources** shows saved messages and which are excluded from future memory. Selecting a checkbox alone changes nothing.
- **Memory used for a reply** lets you choose a **Reply**, then select **Show selected reply**. This is the memory selected before that reply, not its complete prompt or private reasoning. Missing or invalidated selections are identified explicitly.

The status may show learning queued, work in progress or a need for attention. A saved reply and completed background learning are separate events.

## Memory defaults and room settings

Expand sidebar **Settings → Memory defaults** to set shared behavior. For one room, open **⋮ More → Room details → Memory in this room**. **Home** follows the same rules as any room you create.

Room choices set to **Use app default** follow the shared defaults. Explicit room choices remain in place when defaults change. The main choices are **Automatic learning**, **Personal preferences across rooms**, and **Recall original sources**. Recall can use **This room only** or **Across your rooms**. **Room purpose** and **Additional response guidance** give a room its own direction; **Response guidance → Set for this room** enables a room-specific value.

Expand **Prompts and templates** when you want to customize the instructions:

| Setting | Available choices |
| --- | --- |
| **Conversation** | **Quellight default** or **Custom instructions**, which replaces the conversation instructions. |
| **Observer**, **Reflector**, **Source recall** | **Mastra native default** or **Add custom instructions**, which adds to the native instructions. |
| **Personal memory template** | **Quellight · personal preferences**, **Mastra native template**, or **Custom template**. |

Rooms also offer **Use app default** for these choices. **Preview changes** shows the effective settings without saving. Select **Save settings** to apply your edits. Under **Saved versions**, choose a **Version to restore**, then **Restore this version**. Restoring creates another saved version and keeps the history. Saving or restoring settings does not rewrite already learned memory.

## Correct or forget

To correct your profile, open **Memory → Correct or forget**. **Corrected personal memory** contains the full profile: retain everything you want to keep, edit what is wrong, then choose **Save correction**. This replaces the whole personal profile. If you also select messages under **Original sources**, those sources are excluded from future memory and source recall, and observations are rebuilt.

Your edited profile is protected from automatic changes. Conversation observations can continue learning. When you want the profile to learn automatically again, expand **Personal memory** and select **Resume automatic updates**.

To forget sources, select their checkboxes under **Original sources**, then choose **Forget selected sources** under **Correct or forget**. Review the confirmation and choose **Confirm forget**, or **Keep sources** to cancel. Forgotten sources are excluded from future memory and source recall; derived observations are rebuilt. Later assistant text that may repeat those sources is also excluded from memory.

**Original messages remain in the conversation and its export.** The confirmation also states: “Manually edited personal memory is kept; you can edit it separately here.” If your protected profile contains the same detail, remove it from **Corrected personal memory** and save that correction separately.

Changes can take time to finish; check **Memory activity** for the recorded state. If memory changes on another device while you are editing, your draft is kept. **Reload saved memory** replaces that draft with the saved version before you make another change. Archived conversations remain readable, including their memory.

## Desk — Phase 3 candidate

Choose a room, then select **Desk** in the sidebar. On a phone, open **Open rooms** first. Every conversation in a room shares that room's Desk. Desktop shows a list beside the item; on a phone, **Back to Desk** returns from the item to the list. **Back to conversation** preserves your unsent chat draft.

Select **New item**, enter an **Item title** and **Item text**, then **Save item**. Text supports Markdown; **Preview** shows its formatted appearance. Expand **Details and attention** to set a free-form **Kind**, **Status** and attention level. You can also ask Quellight to create or refine a Desk item in conversation. A saved result is shared between devices; unsaved item drafts stay on the device where you wrote them.

| Attention | How Quellight uses it |
| --- | --- |
| **Carried** | The item's complete text is included in the room's conversation context. You choose this level. |
| **Within reach** | Quellight sees an index entry and opens the item when needed. New items start here. |
| **Put away** | The item stays out of ordinary context, but deliberate search can find it. This is separate from archiving. |

Use **Attention filter** to browse any level, including **Put away** without knowing a keyword. **Search Desk → Find items** searches text as well as titles. **More items** loads another page when available. **Archived** shows archived items; **Restore item** returns one to the active Desk.

Expand **Saved versions**, choose a **Version**, and select **Show version** to read earlier text. **Restore this version** creates a new saved revision and keeps the history. If another device saves first, your draft is retained and **Save item** is disabled until you explicitly **Reload saved version**. That confirmation replaces the local draft, so copy anything you still need first. After an interrupted save, **Retry change** checks the original request rather than submitting a different edit.

## Room method — Phase 3 candidate

From **Desk**, select **Room method**. This is a short practical guide to working together in that room. Quellight can learn it after a successful agent-created Desk item; manually creating an item alone does not start method learning. **Method activity** shows recorded work. Opening the page only reads the saved state.

**Edit method and view versions** opens the method as a Desk item. You can edit its wording, inspect its history, or choose its attention. **Within reach** keeps the method editable and available through its index; future automatic updates preserve that placement. **Put away** or archiving the method suspends its automatic updates. Restore it and choose **Carried** or **Within reach** when you want it eligible again.

Use **Learn a working method** to control learning for this room. **Use app default** follows **Settings → Desk defaults**. Turning learning off keeps the saved method; its attention determines how it is used in conversation. **Method instructions → Custom instructions for this room** lets you change the learning prompt. **Save method settings** saves that configuration, while **Settings versions** lets you inspect or restore previous configurations. Existing room overrides survive changes to app defaults. Interrupted settings saves offer **Retry settings change** with the original request.

To inspect a reply, open **⋮ More → Memory → Memory used for a reply**, choose the reply, then **Show Desk context**. This separates the saved Desk selection from **Items opened during reply**, which lists confirmed individual reads. An index entry alone does not mean the item was opened.

Memory **Forget** does not delete Desk documents or their history. Earlier agent-derived items are conservatively excluded from automatic context and agent reuse after source authority changes; independently owner-authored documents remain available. Saving an item with changed text, or explicitly restoring a version, reauthors that saved content. Resaving unchanged text or changing only its title, status or attention keeps the existing source restriction. Edit or archive Desk documents separately when you want to change what they contain or how they are used.
