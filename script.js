const pads = document.querySelectorAll('.pad');

//Keyboard press
document.addEventListener('keydown', (event) => {
  const pressedKey = event.key.toUpperCase();
  const pad = Array.from(pads).find(p => p.dataset.key === pressedKey);

  if (pad) {
    const customSound = pad.dataset.audioUrl;
    const defaultSound = `sounds/${pad.dataset.sound}`;
    const audio = new Audio(customSound || defaultSound);
    audio.play();

    pad.classList.add('playing');
    setTimeout(() => pad.classList.remove('playing'), 150);
  }
});

//Pad interaction
pads.forEach((pad) => {
  //Click
  pad.addEventListener('click', () => {
    const customSound = pad.dataset.audioUrl;
    const defaultSound = `sounds/${pad.dataset.sound}`;
    const audio = new Audio(customSound || defaultSound);
    audio.play();

    pad.classList.add('playing');
    setTimeout(() => pad.classList.remove('playing'), 150);
  });

  //Drag over
  pad.addEventListener('dragover', (e) => {
    e.preventDefault();
    pad.classList.add('dragging');
  });

  //Drag leave
  pad.addEventListener('dragleave', () => {
    pad.classList.remove('dragging');
  });

  //Drop
  pad.addEventListener('drop', (e) => {
    e.preventDefault();
    pad.classList.remove('dragging');

    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('audio/')) {
      alert('Please drop an audio file!');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      pad.dataset.audioUrl = ev.target.result;
      pad.textContent = file.name.split('.')[0];
    };
    reader.readAsDataURL(file);
  });
});
