using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace FirmOS.Revit
{
    /// <summary>
    /// Returns Visible when the string is non-empty, Collapsed otherwise.
    /// Used in XAML bindings as: Visibility="{Binding SomeText, Converter={x:Static ...Instance}}"
    /// </summary>
    public sealed class NonEmptyVisibilityConverter : IValueConverter
    {
        public static readonly NonEmptyVisibilityConverter Instance = new();

        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
            string.IsNullOrEmpty(value as string) ? Visibility.Collapsed : Visibility.Visible;

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
            throw new NotImplementedException();
    }
}
