const youtubedl = require("youtube-dl-exec");
const readline = require("readline");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs").promises;

// Função para configurar o caminho do ffmpeg
function configureFFmpeg() {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Função para remover caracteres inválidos do título do vídeo
function sanitizeTitle(title) {
  return title.replace(/[<>:"/\\|?*]+/g, "");
}

// Função para combinar vídeo e áudio de forma assíncrona
async function combineVideoAndAudio(videoFile, audioFile, outputFilePath) {
  return new Promise((resolve, reject) => {
    configureFFmpeg();
    ffmpeg()
      .input(videoFile)
      .input(audioFile)
      .outputOptions(["-c:v copy", "-c:a aac", "-strict experimental"])
      .output(outputFilePath)
      .on("end", async () => {
        console.log(`Combinação completa! Arquivo salvo como ${outputFilePath}`);
        await removeTempFiles([videoFile, audioFile]);
        resolve();
      })
      .on("error", (error) => {
        console.error("Erro ao combinar vídeo e áudio:", error);
        reject(error);
      })
      .run();
  });
}

// Função para remover arquivos temporários
async function removeTempFiles(files) {
  await Promise.all(files.map((file) => fs.unlink(file)));
  console.log("Arquivos temporários removidos.");
}

// Função para listar as qualidades de vídeo disponíveis, filtrando as indesejadas
function displayAvailableQualities(videoFormats) {
  console.log("Qualidades de vídeo disponíveis:");

  // Filtra apenas formatos com `format_note` e `filesize` definidos
  const filteredFormats = videoFormats.filter(
    (format) => format.format_note && format.filesize
  );

  // Exibe apenas os formatos que passaram no filtro
  filteredFormats.forEach((format, index) => {
    const fileSize = `${(format.filesize / 1048576).toFixed(2)} MB`;
    console.log(`${index + 1} - ${format.format_note} - ${format.ext} - ${fileSize}`);
  });
}

// Função para capturar a escolha do usuário para a qualidade
async function getUserQualityChoice(videoFormats) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question("Digite o índice da qualidade desejada: ", (answer) => {
      const selectedIndex = parseInt(answer) - 1;
      if (selectedIndex >= 0 && selectedIndex < videoFormats.length) {
        resolve(videoFormats[selectedIndex].format_id);
      } else {
        console.log("Índice inválido. Tente novamente.");
        resolve(null);
      }
      rl.close();
    });
  });
}

// Função para fazer download de vídeo e áudio
async function downloadVideoAndAudio(videoURL, videoFormatId, videoTitle) {
  const videoFile = `${videoTitle}_video_temp.mp4`;
  const audioFile = `${videoTitle}_audio_temp.mp3`;

  try {
    await Promise.all([
      youtubedl(videoURL, { format: videoFormatId, output: videoFile }),
      youtubedl(videoURL, { format: "bestaudio", output: audioFile }),
    ]);
    console.log("Download de vídeo e áudio completo.");
    return { videoFile, audioFile };
  } catch (error) {
    console.error("Erro ao baixar o vídeo ou áudio:", error);
    return null;
  }
}

// Função para obter as informações do vídeo
async function fetchVideoInfo(url) {
  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
    });
    return info;
  } catch (error) {
    console.error("Erro ao obter as informações do vídeo:", error);
    return null;
  }
}

// Função para solicitar o link do vídeo ao usuário
function askForVideoURL() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Digite o URL do vídeo do YouTube: ", (url) => {
      rl.close();
      resolve(url);
    });
  });
}

// Função principal para executar o processo
async function processDownloadAndCombine() {
  const videoURL = await askForVideoURL();
  if (!videoURL) {
    console.log("URL do vídeo não fornecida.");
    return;
  }

  const videoInfo = await fetchVideoInfo(videoURL);
  if (!videoInfo) return;

  const videoTitle = sanitizeTitle(videoInfo.title);
  console.log(`Título do vídeo: ${videoTitle}`);

  const videoFormats = videoInfo.formats.filter(
    (format) => format.vcodec !== "none"
  );
  displayAvailableQualities(videoFormats);

  const selectedFormatId = await getUserQualityChoice(videoFormats);
  if (!selectedFormatId) return;

  const { videoFile, audioFile } = await downloadVideoAndAudio(
    videoURL,
    selectedFormatId,
    videoTitle
  );
  if (videoFile && audioFile) {
    const outputFilePath = `${videoTitle}_final_video.mp4`;
    await combineVideoAndAudio(videoFile, audioFile, outputFilePath);
  }
}

processDownloadAndCombine();
