import { Pressable } from 'react-native';
import { router, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n';

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.bg },
        headerTintColor: t.colors.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 20 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.colors.bg },
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textFaint,
        tabBarStyle: {
          backgroundColor: t.colors.card,
          borderTopColor: t.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // Hidden tabs keep their state but stop re-rendering on every store
        // change (a session saved on the timer would otherwise re-run the
        // stats and goals screens in the background).
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tab.library'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/notes')}
              hitSlop={10}
              style={{ marginRight: 16 }}
              accessibilityRole="button"
              accessibilityLabel={tr('notes.title')}
            >
              <Ionicons name="chatbox-ellipses-outline" size={24} color={t.colors.text} />
            </Pressable>
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: tr('tab.stats'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: tr('tab.goals'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: tr('tab.settings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
