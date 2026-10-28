using System;
using CommunityToolkit.Mvvm.ComponentModel;

namespace NovaTrpgClient.Models
{
    // Клас успадковує ObservableObject для підтримки оновлень у реальному часі
    public partial class ChatMessage : ObservableObject
    {
        [ObservableProperty]
        private string _sender = string.Empty;

        [ObservableProperty]
        private string _text = string.Empty;

        [ObservableProperty]
        private string _senderColor = "#E5E7EB";

        [ObservableProperty]
        private string _timeText = DateTime.Now.ToString("HH:mm");

        [ObservableProperty]
        private bool _canRollback = false;
    }
}
