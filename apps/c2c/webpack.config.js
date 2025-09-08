const { composePlugins, withNx } = require('@nx/webpack');

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), (config) => {
  // Configure externals to prevent bundling certain dependencies
  config.externals = {
    // NestJS optional dependencies
    '@nestjs/websockets': '@nestjs/websockets',
    '@nestjs/websockets/socket-module': '@nestjs/websockets/socket-module',
    '@grpc/grpc-js': '@grpc/grpc-js',
    '@grpc/proto-loader': '@grpc/proto-loader',
    'kafkajs': 'kafkajs',
    'mqtt': 'mqtt',
    'nats': 'nats',
    'amqplib': 'amqplib',
    'amqp-connection-manager': 'amqp-connection-manager',
    
    // Class transformer optional dependencies
    'class-transformer/storage': 'class-transformer/storage',
    
    // Express template engines (optional)
    'atpl': 'atpl',
    'twig': 'twig',
    'jazz': 'jazz',
    'jqtpl': 'jqtpl',
    'hamljs': 'hamljs',
    'underscore': 'underscore',
    'lodash': 'lodash',
    'just': 'just',
    'dot': 'dot',
    'ractive': 'ractive',
    'nunjucks': 'nunjucks',
    'react-dom/server': 'react-dom/server',
    'teacup/lib/express': 'teacup/lib/express',
    'coffee-script': 'coffee-script',
    'liquid-node': 'liquid-node',
    'jade': 'jade',
    'swig': 'swig',
    'swig-templates': 'swig-templates',
    'pug': 'pug',
    
    // Optional WebSocket utilities
    'bufferutil': 'bufferutil',
    'utf-8-validate': 'utf-8-validate',
  };

  return config;
});
