const topics = {
  telemetry: (kioskId) => `orionvolt/${kioskId}/telemetry`,
  status: (kioskId) => `orionvolt/${kioskId}/status`,
  command: (kioskId) => `orionvolt/${kioskId}/command`
};

const SUBSCRIBE_TOPICS = ['orionvolt/+/telemetry', 'orionvolt/+/status'];

const QOS = {
  TELEMETRY: 0,
  STATUS: 1,
  COMMAND: 1
};

const parseTopic = (topic) => {
  const parts = topic.split('/');
  if (parts.length >= 3 && parts[0] === 'orionvolt') {
    return {
      kioskId: parts[1],
      messageType: parts[2]
    };
  }
  return null;
};

module.exports = {
  topics,
  SUBSCRIBE_TOPICS,
  QOS,
  parseTopic
};
