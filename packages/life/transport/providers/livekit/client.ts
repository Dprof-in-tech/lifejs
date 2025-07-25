import { Room, RoomEvent } from "livekit-client";
import { z } from "zod";
import { ClientTransportBase, type ClientTransportEvent } from "../base/client";

// - Config
// export const livekitClientConfigSchema = z.object({
//   serverUrl: z
//     .string()
//     .url()
//     .default(process.env.LIVEKIT_SERVER_URL ?? "ws://localhost:7880"),
// });
// export type LiveKitClientConfig<T extends "input" | "output"> = T extends "input"
//   ? z.input<typeof livekitClientConfigSchema>
//   : z.output<typeof livekitClientConfigSchema>;

// - Transport
export class LiveKitClientTransport extends ClientTransportBase<z.AnyZodObject> {
  isConnected = false;
  room: Room | null = null;
  listeners: Partial<
    Record<ClientTransportEvent["type"], ((event: ClientTransportEvent) => void)[]>
  > = {};

  constructor() {
    super(z.object({}), {});
    this.config.serverUrl = process.env.LIVEKIT_SERVER_URL ?? "ws://localhost:7880";
  }

  ensureConnected(
    name: string,
    connector: LiveKitClientTransport,
  ): asserts connector is LiveKitClientTransport & {
    room: Room & { localParticipant: NonNullable<Room["localParticipant"]> };
  } {
    if (!(this.isConnected && this.room?.localParticipant))
      throw new Error(
        `Calling this code (${name}) requires a connected room. Call joinRoom() first.`,
      );
  }

  async joinRoom(roomId: string, token: string): Promise<void> {
    // If we are already connected to this room, do nothing
    if (roomId === this.room?.name) return;
    // If we are already connected to a room, leave it before
    if (this.isConnected) await this.leaveRoom();

    // Create the room and set up event listeners
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      publishDefaults: {
        dtx: true,
        red: true,
      },
    });
    this.room.on(RoomEvent.TrackSubscribed, (track) => {
      const element = track.attach();
      document.body.appendChild(element);
    });

    // Connect to the room and auto-subscribe to tracks
    await this.room.connect(this.config.serverUrl, token, { autoSubscribe: true });
    this.isConnected = true;
  }

  async leaveRoom(): Promise<void> {
    this.ensureConnected("leaveRoom", this);
    await this.room.disconnect();
    this.isConnected = false;
  }

  async streamText(
    topic: string,
  ): Promise<
    Omit<
      WritableStreamDefaultWriter<string>,
      "desiredSize" | "closed" | "ready" | "abort" | "releaseLock"
    >
  > {
    this.ensureConnected("streamText", this);
    return await this.room.localParticipant.streamText({ topic });
  }

  receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => void | Promise<void>,
  ) {
    this.ensureConnected("receiveText", this);
    this.room.registerTextStreamHandler(topic, (iterator, participantInfo) => {
      callback(iterator as AsyncIterable<string>, participantInfo.identity);
    });
  }

  async enableMicrophone() {
    this.ensureConnected("enableMicrophone", this);
    await this.room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: false,
      noiseSuppression: false,
      voiceIsolation: false,
    });
  }

  async playAudio() {
    this.ensureConnected("playAudio", this);
    await this.room.startAudio();
  }

  on<EventType extends ClientTransportEvent["type"]>(
    type: EventType,
    callback: (data: Extract<ClientTransportEvent, { type: EventType }>) => void,
  ): void {
    if (!this.room) throw new Error("Room not connected.");
    console.log(type, callback);
    throw new Error("Not implemented.");
    // if (!this.listeners[type]) this.listeners[type] = [];
    // this.listeners[type].push(callback as (event: ClientConnectorEvent) => void);
  }
}
