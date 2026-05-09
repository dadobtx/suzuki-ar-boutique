import type { Meta, StoryObj } from '@storybook/react';
import { NeonButton } from './NeonButton';

const meta = {
  title: 'HUD/NeonButton',
  component: NeonButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['cyan', 'red', 'yellow'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
} satisfies Meta<typeof NeonButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cyan: Story = {
  args: {
    variant: 'cyan',
    size: 'md',
    children: 'READY TO RIDE',
  },
};

export const Red: Story = {
  args: {
    variant: 'red',
    size: 'lg',
    children: 'TURBO MODE',
  },
};

export const Yellow: Story = {
  args: {
    variant: 'yellow',
    size: 'sm',
    children: 'CATALOG',
  },
};

export const Disabled: Story = {
  args: {
    variant: 'cyan',
    size: 'md',
    children: 'DISABLED',
    disabled: true,
  },
};
