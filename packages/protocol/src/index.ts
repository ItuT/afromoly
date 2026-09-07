/**
 * The wire protocol between the Afromoly browser client and the game server.
 *
 * It lives in its own package, with no dependency beyond the rules engine, so
 * the browser bundle never pulls in AWS code just to know the message shapes.
 */
export * from './protocol.js';
