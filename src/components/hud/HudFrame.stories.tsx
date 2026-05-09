import type { Meta, StoryObj } from '@storybook/react';
import { HudFrame } from './HudFrame';

const meta = {
  title: 'HUD/HudFrame',
  component: HudFrame,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['cyan', 'red', 'muted'],
    },
    corners: { control: 'boolean' },
  },
} satisfies Meta<typeof HudFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cyan: Story = {
  args: {
    variant: 'cyan',
    corners: true,
    children: (
      <div className="p-8 font-mono text-sm text-fg">
        <div className="text-accent-cyan text-lg font-display mb-2">TELEMETRY</div>
        <div>FPS: 30 · LAT: 12ms · POSE: OK</div>
      </div>
    ),
  },
};

export const Red: Story = {
  args: {
    variant: 'red',
    corners: true,
    children: (
      <div className="p-8 font-mono text-sm text-fg">
        <div className="text-brand-red text-lg font-display mb-2">WARNING</div>
        <div>Camera access denied</div>
      </div>
    ),
  },
};

export const NoCorners: Story = {
  args: {
    variant: 'muted',
    corners: false,
    children: (
      <div className="p-6 font-mono text-sm text-fg-muted">
        Minimal frame without corner accents
      </div>
    ),
  },
};
