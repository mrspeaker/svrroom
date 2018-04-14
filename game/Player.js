class Player {
  constructor(id, world) {
    this.id = id;
    this.pos = {
      x: 0,
      y: 0
    };
    this.w = 3;
    this.h = 3;
    this.world = world;
    this.angle = 0;
    this.speed = 2;
  }

  update(input) {
    const { pos, w, h, world, angle, speed } = this;
    const { boxes } = world;
    let { xo, yo } = input;

    const xx = Math.cos(angle) * speed * yo;
    const yy = Math.sin(angle) * speed * yo;

    this.angle += xo;

    const noHit = boxes.every(b => {
      if (
        pos.x + xx + w >= b.x &&
        pos.x + xx <= b.x + b.w &&
        pos.y + yy + h >= b.y &&
        pos.y + yy <= b.y + b.h
      ) {
        return false;
      }
      return true;
    });
    if (noHit) {
      pos.x += xx;
      pos.y += yy;
    } else {
      // NOPE: wll be different local / server.
      pos.x += Math.random() * 2 - 1;
      pos.y += Math.random() * 2 - 1;
    }
  }
}

export default Player;
