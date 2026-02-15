import './home.css';
import { IoFlashSharp, IoChatbubblesSharp, IoCopyOutline, IoCheckmark } from 'react-icons/io5';
import { MdGpsFixed } from 'react-icons/md';
import { BiSolidLock } from 'react-icons/bi';
import { RiPaletteFill } from 'react-icons/ri';
import { codeToHtml } from 'shiki';
import { useState } from 'react';

export const frontmatter = {
  pageType: 'custom',
};

// Client-side copy button component
const CopyButton = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className="copy-button" onClick={handleCopy} type="button">
      {copied ? <IoCheckmark /> : <IoCopyOutline />}
    </button>
  );
};

export const Home = async () => {
  // Generate syntax-highlighted code snippets using Shiki
  const installCodeRaw = 'bun add dialogue-ts zod';
  const installCode = await codeToHtml(installCodeRaw, {
    lang: 'bash',
    theme: 'vitesse-dark',
  });

  const serverCodeRaw = `// server.ts
import { createDialogue, defineEvent } from "dialogue-ts";
import { z } from "zod";

const Message = defineEvent("message", {
  schema: z.object({
    text: z.string(),
    senderId: z.string(),
  }),
});

const dialogue = createDialogue({
  rooms: {
    chat: {
      name: "Chat Room",
      events: [Message],
    },
  },
});

await dialogue.start();`;

  const serverCode = await codeToHtml(serverCodeRaw, {
    lang: 'typescript',
    theme: 'vitesse-dark',
  });

  const clientCodeRaw = `// client.ts
import { createDialogueClient } from "dialogue-ts/client";

const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: { userId: "user-123" },
});

await client.connect();

const chat = await client.join("chat");

chat.on("message", (msg) => {
  console.log(msg.data.text);
});

chat.trigger("message", {
  text: "Hello!",
  senderId: "user-123",
});`;

  const clientCode = await codeToHtml(clientCodeRaw, {
    lang: 'typescript',
    theme: 'vitesse-dark',
  });

  return (
    <div className="dialogue-home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-icon"><IoChatbubblesSharp /></span>
            <span className="highlight">Dialogue</span>
          </h1>
          <p className="hero-tagline">
            Event-based realtime communication library built on Socket.IO, Hono, and Bun
          </p>
          <div className="hero-actions">
            <a href="/guide/getting-started" className="btn btn-primary">
              Get Started
            </a>
            <a 
              href="https://github.com/Hussseinkizz/dialogue" 
              className="btn btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section className="installation">
        <h2>Installation</h2>
        <div className="code-wrapper">
          <div className="code-block" dangerouslySetInnerHTML={{ __html: installCode }} />
          <CopyButton code={installCodeRaw} />
        </div>
      </section>

      {/* Quick Start Section */}
      <section className="quick-start">
        <h2>Quick Start</h2>
        <div className="code-grid">
          <div className="code-column">
            <h3>Server Setup</h3>
            <div className="code-wrapper">
              <div className="code-block" dangerouslySetInnerHTML={{ __html: serverCode }} />
              <CopyButton code={serverCodeRaw} />
            </div>
          </div>
          <div className="code-column">
            <h3>Client Setup</h3>
            <div className="code-wrapper">
              <div className="code-block" dangerouslySetInnerHTML={{ __html: clientCode }} />
              <CopyButton code={clientCodeRaw} />
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features">
        <h2 className="features-title">Why Dialogue?</h2>
        <div className="features-grid">
          <div className="feature">
            <div className="feature-icon"><IoFlashSharp /></div>
            <h3>Config-first</h3>
            <p>Define all rooms and events upfront in one configuration file</p>
          </div>
          <div className="feature">
            <div className="feature-icon"><MdGpsFixed /></div>
            <h3>Event-centric</h3>
            <p>Events are first-class citizens with optional Zod schema validation</p>
          </div>
          <div className="feature">
            <div className="feature-icon"><BiSolidLock /></div>
            <h3>Type-safe</h3>
            <p>Full TypeScript support with inferred types from schemas</p>
          </div>
          <div className="feature">
            <div className="feature-icon"><RiPaletteFill /></div>
            <h3>Unified API</h3>
            <p>Backend and frontend share similar mental models</p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="use-cases">
        <h2>Use Cases</h2>
        <div className="use-cases-grid">
          <div className="use-case">
            <h3>Real-time Chat Applications</h3>
            <p>Define a <code>Message</code> event with Zod schema for text validation. Use <code>user:joined</code> and <code>user:left</code> events for presence tracking. Add a <code>typing</code> event to show when users are composing messages. All events are type-safe and automatically validated.</p>
            <a href="/examples" className="use-case-link">View chat examples →</a>
          </div>
          <div className="use-case">
            <h3>Live Dashboards & Analytics</h3>
            <p>Create events like <code>metrics:update</code> and <code>data:refresh</code> with schemas that enforce data structure. Use Dialogue's room system to organize different dashboard views. Type inference ensures your frontend receives correctly-typed data from the server.</p>
            <a href="/examples" className="use-case-link">View dashboard examples →</a>
          </div>
          <div className="use-case">
            <h3>Collaborative Tools</h3>
            <p>Define <code>cursor:move</code>, <code>document:edit</code>, and <code>selection:change</code> events to track user interactions. Dialogue's event system handles real-time broadcasting to all participants in a room while Zod validates each action's payload.</p>
            <a href="/examples" className="use-case-link">View collaboration examples →</a>
          </div>
          <div className="use-case">
            <h3>Gaming & Multiplayer</h3>
            <p>Set up events like <code>player:move</code>, <code>game:action</code>, and <code>lobby:join</code> with strict schemas. Use rooms for game lobbies and matches. Dialogue validates player inputs server-side, preventing cheating and ensuring game state consistency.</p>
            <a href="/examples" className="use-case-link">View gaming examples →</a>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="comparison">
        <h2>Dialogue vs Bare Socket.IO</h2>
        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Dialogue</th>
                <th>Socket.IO</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Schema Validation</td>
                <td className="has-feature">Built-in Zod integration</td>
                <td className="no-feature">Manual validation required</td>
              </tr>
              <tr>
                <td>Type Safety</td>
                <td className="has-feature">Automatic type inference from schemas</td>
                <td className="no-feature">Manual type definitions needed</td>
              </tr>
              <tr>
                <td>Event System</td>
                <td className="has-feature">Declarative event definitions with first-class support</td>
                <td className="no-feature">String-based event names, no structure</td>
              </tr>
              <tr>
                <td>Room Management</td>
                <td className="has-feature">Configured upfront with type-safe joins</td>
                <td className="no-feature">Manual join/leave handling</td>
              </tr>
              <tr>
                <td>Developer Experience</td>
                <td className="has-feature">Unified API, less boilerplate</td>
                <td className="no-feature">More setup code, repetitive patterns</td>
              </tr>
              <tr>
                <td>Runtime Safety</td>
                <td className="has-feature">Events validated against schemas at runtime</td>
                <td className="no-feature">No built-in validation</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="home-footer">
        <p>Built with love by <a href="https://github.com/Hussseinkizz" target="_blank" rel="noopener noreferrer">Hussein Kizz</a></p>
      </footer>
    </div>
  );
};

export default Home;
