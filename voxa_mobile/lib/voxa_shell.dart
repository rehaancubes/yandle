import 'package:flutter/material.dart';

import 'pages/admin_page.dart';
import 'pages/admin_conversations_page.dart';
import 'pages/admin_customers_page.dart';
import 'pages/admin_website_page.dart';
import 'pages/admin_profile_page.dart';
import 'pages/bookings_page.dart';
import 'pages/calls_page.dart';
import 'pages/discover_page.dart';
import 'pages/profile_page.dart';

class VoxaShell extends StatefulWidget {
  const VoxaShell({super.key});

  @override
  State<VoxaShell> createState() => _VoxaShellState();
}

class _VoxaShellState extends State<VoxaShell> {
  int _index = 0;
  bool _isAdminMode = false;
  String? _adminHandle;
  String? _adminDisplayName;
  String? _adminUseCase;

  void _toggleAdminMode({
    required bool enable,
    String? handle,
    String? displayName,
    String? useCase,
  }) {
    setState(() {
      _isAdminMode = enable;
      _adminHandle = handle;
      _adminDisplayName = displayName;
      _adminUseCase = useCase;
      _index = 0;
    });
  }

  List<Widget> get _userTabs => const [
        DiscoverPage(),
        CallsPage(),
        BookingsPage(),
      ];

  List<Widget> _adminTabs() => [
        AdminPage(
          handle: _adminHandle ?? '',
          displayName: _adminDisplayName,
          useCase: _adminUseCase,
        ),
        AdminConversationsPage(handle: _adminHandle ?? ''),
        AdminCustomersPage(handle: _adminHandle ?? ''),
        AdminWebsitePage(handle: _adminHandle ?? ''),
        AdminProfilePage(
          handle: _adminHandle ?? '',
          displayName: _adminDisplayName,
          useCase: _adminUseCase,
          onToggleOff: () => _toggleAdminMode(enable: false),
        ),
      ];

  @override
  Widget build(BuildContext context) {
    final tabs = _isAdminMode ? _adminTabs() : _userTabs;
    // Add profile page for user mode
    final allTabs = _isAdminMode
        ? tabs
        : [
            ...tabs,
            ProfilePage(
              onAdminToggle: ({
                required String handle,
                String? displayName,
                String? useCase,
              }) {
                _toggleAdminMode(
                  enable: true,
                  handle: handle,
                  displayName: displayName,
                  useCase: useCase,
                );
              },
            ),
          ];

    return Scaffold(
      body: IndexedStack(
        index: _index.clamp(0, allTabs.length - 1),
        children: allTabs,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(
            top: BorderSide(color: Color(0xFF1E293B), width: 0.5),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _index.clamp(0, (_isAdminMode ? 4 : 3)),
          backgroundColor: const Color(0xFF020617),
          surfaceTintColor: Colors.transparent,
          indicatorColor: const Color(0xFF1D2438),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (value) => setState(() => _index = value),
          destinations: _isAdminMode
              ? const [
                  NavigationDestination(
                    icon: Icon(Icons.event_note_outlined),
                    selectedIcon: Icon(Icons.event_note_rounded),
                    label: 'Bookings',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.chat_bubble_outline_rounded),
                    selectedIcon: Icon(Icons.chat_bubble_rounded),
                    label: 'Chats',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.people_outline_rounded),
                    selectedIcon: Icon(Icons.people_rounded),
                    label: 'Customers',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.language_rounded),
                    selectedIcon: Icon(Icons.language_rounded),
                    label: 'Website',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline_rounded),
                    selectedIcon: Icon(Icons.person_rounded),
                    label: 'Profile',
                  ),
                ]
              : const [
                  NavigationDestination(
                    icon: Icon(Icons.explore_outlined),
                    selectedIcon: Icon(Icons.explore_rounded),
                    label: 'Discover',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.mic_none_rounded),
                    selectedIcon: Icon(Icons.mic_rounded),
                    label: 'Calls',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.event_note_outlined),
                    selectedIcon: Icon(Icons.event_note_rounded),
                    label: 'Bookings',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline_rounded),
                    selectedIcon: Icon(Icons.person_rounded),
                    label: 'Profile',
                  ),
                ],
        ),
      ),
    );
  }
}
