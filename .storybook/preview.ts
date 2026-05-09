import type { Preview } from '@storybook/react';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'suzuki-dark',
      values: [
        { name: 'suzuki-dark', value: '#07080F' },
        { name: 'suzuki-surface', value: '#11141C' },
      ],
    },
  },
};

export default preview;
