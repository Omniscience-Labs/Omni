export const getAgentAvatar = (agentId: string) => {
    const avatars = ['🤖', '🎯', '⚡', '🚀', '🔮', '🎨', '📊', '🔧', '💡', '🌟'];
    const colors = ['bg-cyan-400', 'bg-green-400', 'bg-purple-400', 'bg-blue-400', 'bg-pink-400', 'bg-yellow-400', 'bg-red-400', 'bg-indigo-400'];
    const avatarIndex = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % avatars.length;
    const colorIndex = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return {
      avatar: avatars[avatarIndex],
      color: colors[colorIndex]
    };
  };