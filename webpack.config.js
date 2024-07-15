import path from 'path';

export default {
  mode: 'development',
  entry: './public/new-chat-room.js',
  output: {
    filename: 'main.js',
    path: path.resolve(process.cwd(), 'dist'),
  },
};