import type { BoardDocument } from '../../domain/document.js'
import { setBoardTitle } from './set-board-title.js'
import { restoreBoard } from './restore-board.js'
import type { Patch } from '../../domain/patch.js'
import type { CommandContext, Command } from '../types.js'
import { applyRemotePatches } from './apply-remote-patches.js'
import { alignObjects, distributeObjects } from './arrange-objects.js'
import { deriveObject } from './derive-object.js'
import { duplicateObjects } from './duplicate-objects.js'
import { pasteObjects } from './paste-objects.js'
import { groupObjects } from './group-objects.js'
import { ungroupObjects } from './ungroup-objects.js'
import { convertObjects } from './convert-objects.js'
import { createObjects } from './create-objects.js'
import { reorderObjects } from './reorder-objects.js'
import { repairParentage } from './repair-parentage.js'
import { reparentObjects } from './reparent-objects.js'
import { rotateObjects } from './rotate-objects.js'
import { setHidden, setLocked } from './set-flags.js'
import { toggleReaction } from './toggle-reaction.js'
import { answerPoll } from './answer-poll.js'
import { castDotVote, removeDotVote, setVoteRound, startVoteRound } from './dot-voting.js'
import { deleteObjects } from './delete-objects.js'
import { moveObjects } from './move-objects.js'
import { resizeObjects } from './resize-objects.js'
import { updateObjectData } from './update-object-data.js'
import { updateStyle } from './update-style.js'

/**
 * Routes a command to its handler.
 *
 * This switch is EXHAUSTIVE and lives in exactly one file. It switches on
 * `command.kind` — never on `object.type`, which is the registry's job. Adding
 * a command adds a case here; adding an object type touches nothing in this
 * folder at all.
 */
export function handleCommand(
  doc: BoardDocument,
  command: Command,
  ctx: CommandContext,
): readonly Patch[] {
  switch (command.kind) {
    case 'SetBoardTitle':
      return setBoardTitle(doc, command)
    case 'RestoreBoard':
      return restoreBoard(doc, command, ctx)
    case 'CreateObjects':
      return createObjects(doc, command, ctx)
    case 'DeleteObjects':
      return deleteObjects(doc, command, ctx)
    case 'ConvertObjects':
      return convertObjects(doc, command, ctx)
    case 'MoveObjects':
      return moveObjects(doc, command)
    case 'ResizeObjects':
      return resizeObjects(doc, command, ctx)
    case 'UpdateObjectData':
      return updateObjectData(doc, command, ctx)
    case 'UpdateStyle':
      return updateStyle(doc, command, ctx)
    case 'RotateObjects':
      return rotateObjects(doc, command, ctx)
    case 'ReorderObjects':
      return reorderObjects(doc, command)
    case 'SetLocked':
      return setLocked(doc, command)
    case 'SetHidden':
      return setHidden(doc, command)
    case 'ReparentObjects':
      return reparentObjects(doc, command, ctx)
    case 'GroupObjects':
      return groupObjects(doc, command, ctx)
    case 'UngroupObjects':
      return ungroupObjects(doc, command, ctx)
    case 'AlignObjects':
      return alignObjects(doc, command, ctx)
    case 'DistributeObjects':
      return distributeObjects(doc, command, ctx)
    case 'PasteObjects':
      return pasteObjects(doc, command, ctx)
    case 'DuplicateObjects':
      return duplicateObjects(doc, command, ctx)
    case 'DeriveObject':
      return deriveObject(doc, command, ctx)
    case 'ApplyRemotePatches':
      return applyRemotePatches(doc, command, ctx)
    case 'ToggleReaction':
      return toggleReaction(doc, command, ctx)
    case 'StartVoteRound':
      return startVoteRound(doc, command, ctx)
    case 'CastDotVote':
      return castDotVote(doc, command, ctx)
    case 'RemoveDotVote':
      return removeDotVote(doc, command, ctx)
    case 'SetVoteRound':
      return setVoteRound(doc, command, ctx)
    case 'AnswerPoll':
      return answerPoll(doc, command, ctx)
    case 'RepairParentage':
      return repairParentage(doc, command)
  }
}

export {
  alignObjects,
  applyRemotePatches,
  deriveObject,
  distributeObjects,
  duplicateObjects,
  groupObjects,
  ungroupObjects,
  convertObjects,
  createObjects,
  deleteObjects,
  moveObjects,
  reorderObjects,
  repairParentage,
  reparentObjects,
  resizeObjects,
  rotateObjects,
  setHidden,
  setLocked,
  updateObjectData,
  updateStyle,
}
