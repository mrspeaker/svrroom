import env from "./game/env.js";
import World from "./game/World.js";
import Renderer from "./game/Renderer.js";

const $ = sel => document.querySelector(sel);
const $on = (sel, action, f) => $(sel).addEventListener(action, f, false);
const msg = m =>
  ($("#msgs").innerText = m + "\n" + $("#msgs").innerText.slice(0, 200));
const dgb = m => ($("#dbg").innerText = m);
const $id = id => ($("#client_id").innerText = id);
const $player_id = id => ($("#player_id").innerText = id);
const $world_id = id => ($("#world_id").innerText = id);

class ClientGame {
  constructor() {
    this.world = null;
    this.renderer = null;
    this.client_id = null;
    this.player_id = null;
    this.ws = null;

    this.pending_inputs = [];
    this.input_sequence_number = 0;

    this.entities = new Map();
    this.entity = null;

    this.xo = 0;
    this.yo = 0.15;
    this.lastX = 0;
    this.lastY = 0;

    $on("#btnLeft", "click", () => (this.yo = -1));
    $on("#btnRight", "click", () => (this.yo = +1));
    $on("#btnSend", "click", () =>
      this.send({ action: "CHAT", msg: $("#msg").value })
    );
    $("#host").value = env.base;
    $("#port").value = env.port;
    $("#btnJoin").onclick = () =>
      this.connect($("#host").value, $("#port").value);

    this.ticker = (() => {
      let ds = [];
      return () => {
        const dx = ds.slice(1).map((d, i) => d - ds[i]);
        ds = [...ds.slice(-30), Date.now()];
        return dx.reduce((ac, el) => ac + el, 0) / dx.length;
      };
    })();
  }

  connect(host, port) {
    if (this.client_id) {
      return;
    }
    const ws = new WebSocket(`ws://${host}:${port}`);
    ws.addEventListener("open", () => {}, false);
    ws.addEventListener("error", e => console.error(e), false);
    ws.addEventListener("close", () => msg("disconnected"), false);
    ws.addEventListener("message", e => this.receive(e), false);
    this.ws = ws;
  }

  newWorld(data) {
    const { seed } = data;
    msg("Startin game." + JSON.stringify(data));
    this.start = Date.now();

    this.world = new World(seed);
    this.world.state = "INIT";
    this.renderer = new Renderer();
    this.entities = new Map();

    this.pending_inputs = [];
    this.input_sequence_number = 0;
    this.setEntities([{ id: data.id, x: data.x, y: data.y, bot: false }]);
    // Get local entity
    this.entity = this.entities.get(this.player_id);
    this.entity.__local = true;
  }

  receive(e) {
    const data = JSON.parse(e.data);
    const { action } = data;
    switch (action) {
      case "CONNECTED":
        this.client_id = data.id;
        msg("Connected. Client id " + this.client_id);
        $id(this.client_id);
        break;

      case "NEW_WORLD":
        if (this.tickTimer) {
          clearTimeout(this.tickTimer);
        }
        this.player_id = data.id;
        $player_id(this.player_id);
        $world_id(data.world);
        this.newWorld(data);
        this.tick();
        break;

      case "TICK":
        this.onReceiveTick(data);
        break;

      default:
        msg(e.data);
    }
  }

  send(msg) {
    const { ws } = this;
    if (!ws || ws.readyState !== ws.OPEN) {
      return;
    }
    ws.send(JSON.stringify(msg));
  }

  onReceiveTick(data) {
    switch (data.state) {
      case "READY":
        this.world.state = "READY " + data.time;
        break;
      case "PLAY":
        this.lastTick = Date.now();
        this.world.state = "";
        this.setEntities(data.pos, data.dead);
        $player_id(this.pending_inputs.length);
        if (data.isDead) {
          this.world.state = "DEAD";
        }

        // Apply pending inputs to player
        this.pending_inputs = this.pending_inputs.filter(i => {
          if (i.seq > data.lseq) {
            return true;
          }
          this.entity.update(i);
          return false;
        });
        break;
      case "GAMEOVER":
        this.world.state = "GAMEOVER" + data.time;
        break;
    }
  }

  setEntities(data, dead = []) {
    const { world, entities } = this;
    data.forEach(p => {
      const { id, x, y, angle, bot } = p;
      let entity = entities.get(id);
      if (!entity) {
        // new entity
        entity = world.addEntity(id);
        entities.set(id, entity);
        entity.__bot = bot;
        entity.pos.x = x;
        entity.pos.y = y;
        entity.position_buffer = [];
      } else if (entity === this.entity) {
        // Local entity, just set it.
        this.lastX = x;
        this.lastY = y;
        entity.pos.x = x;
        entity.pos.y = y;
      } else {
        // Add it to the position buffer for interpolation
        entity.position_buffer.push([Date.now(), { x, y }]);
      }
      entity.angle = angle;
    });

    dead.forEach(id => {
      const e = entities.get(id);
      world.removeEntity(e);
      entities.delete(id);
    });
  }

  tick() {
    const { world, renderer } = this;
    if (!world) {
      return;
    }

    if (!world.isDead) {
      if (Math.random() < 0.03) {
        //  this.yo = Math.random() * 0.3 + 0.1;
        this.xo = 0;
      }
      this.xo += (Math.random() * 2 - 1) * 0.01;

      this.processInputs();
    }
    this.interpolateEntities();

    world.tick();
    renderer.render(world);

    dgb(
      world.scene.length +
        ":" +
        this.entities.size +
        " __ " +
        this.lastX.toFixed(0) +
        ":" +
        this.lastY.toFixed(0) +
        " __ " +
        ((this.lastTick - this.start) / 1000).toFixed(0)
    );
    this.tickTimer = setTimeout(() => this.tick(), 1000 / 30);
  }

  processInputs() {
    const { xo, yo, player_id } = this;
    if (!(xo || yo)) {
      return;
    }
    const input = {
      action: "INPUT",
      xo,
      yo,
      seq: this.input_sequence_number++,
      entity_id: player_id
    };

    this.pending_inputs.push(input);
    this.send(input);
    this.entity.update(input);
  }

  interpolateEntities() {
    const { entities, entity } = this;
    const entity_id = entity.id;
    const now = Date.now();
    const render_timestamp = now - 1000.0 / 10.0; //server.update_rate;
    entities.forEach(entity => {
      if (entity.id == entity_id) {
        return;
      }
      // Find the two authoritative positions surrounding the rendering timestamp.
      const buffer = entity.position_buffer;
      // Drop older positions.
      while (buffer.length >= 2 && buffer[1][0] <= render_timestamp) {
        buffer.shift();
      }

      // Interpolate between the two surrounding authoritative positions.
      if (
        buffer.length >= 2 &&
        buffer[0][0] <= render_timestamp &&
        render_timestamp <= buffer[1][0]
      ) {
        var pos0 = buffer[0][1];
        var pos1 = buffer[1][1];
        var t0 = buffer[0][0];
        var t1 = buffer[1][0];

        // lerp
        entity.pos.x =
          pos0.x + (pos1.x - pos0.x) * (render_timestamp - t0) / (t1 - t0);
        entity.pos.y =
          pos0.y + (pos1.y - pos0.y) * (render_timestamp - t0) / (t1 - t0);
      }
    });
  }
}

new ClientGame();
