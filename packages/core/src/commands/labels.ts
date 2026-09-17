import type { Command } from './types.js'

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Human-readable undo labels. The one place command wording lives. */
export function describeCommand(command: Command): string {
  switch (command.kind) {
    case 'CreateObjects':
      return `Create ${plural(command.objects.length, 'object')}`
    case 'DeleteObjects':
      return `Delete ${plural(command.ids.length, 'object')}`
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
  }
}
