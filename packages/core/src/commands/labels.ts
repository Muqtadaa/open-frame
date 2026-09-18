import type { Command } from './types.js'

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Human-readable undo labels. The one place command wording lives. */
export function describeCommand(command: Command): string {
  switch (command.kind) {
    case 'CreateObjects':
      return `Create ${plural(command.objects.length, 'object')}`
    case 'DeleteObjects':
      return `Delete ${plural(command.ids.length, 'object')}`
    case 'ConvertObjects':
      // Named for what the user did, not for the mechanism: they promoted a
      // note to evidence, they did not "set three paths".
      return `Promote ${plural(command.ids.length, 'object')} to ${command.toType}`
    case 'MoveObjects':
      return `Move ${plural(command.moves.length, 'object')}`
    case 'ResizeObjects':
      return `Resize ${plural(command.resizes.length, 'object')}`
    case 'UpdateObjectData':
      return 'Edit object'
    case 'UpdateStyle':
      return `Restyle ${plural(command.ids.length, 'object')}`
    case 'RotateObjects':
      return `Rotate ${plural(command.rotations.length, 'object')}`
    case 'ReorderObjects':
      return command.placement === 'front'
        ? 'Bring to front'
        : command.placement === 'back'
          ? 'Send to back'
          : command.placement === 'forward'
            ? 'Bring forward'
            : 'Send backward'
    case 'SetLocked':
      return command.locked ? 'Lock' : 'Unlock'
    case 'SetHidden':
      return command.hidden ? 'Hide' : 'Show'
    case 'ReparentObjects':
      return command.parentId === null
        ? `Remove ${plural(command.ids.length, 'object')} from frame`
        : `Move ${plural(command.ids.length, 'object')} into frame`
    // Both of these are skipUndo by construction, so neither label reaches an
    // undo menu. They are still written for a person, because they are what a
    // change log or a sync trace will show when something has gone wrong.
    case 'ApplyRemotePatches':
      return `Merge ${plural(command.patches.length, 'remote change')}`
    case 'RepairParentage':
      return 'Repair board structure'
  }
}
